import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

const TABLE_NAME = process.env.MUSIC_TABLE_NAME || 'MusicData';

let _client;
function getDocClient() {
  if (!_client) {
    const config = { region: process.env.DYNAMO_REGION || process.env.AWS_REGION || 'us-west-2' };
    // Connect to DynamoDB Local when running locally
    if (process.env.DYNAMO_ENDPOINT) {
      config.endpoint = process.env.DYNAMO_ENDPOINT;
      config.credentials = { accessKeyId: 'local', secretAccessKey: 'local' };
    }
    const ddb = new DynamoDBClient(config);
    _client = DynamoDBDocumentClient.from(ddb, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _client;
}

export async function putItem(item) {
  await getDocClient().send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
}

export async function getItem(pk, sk) {
  const { Item } = await getDocClient().send(
    new GetCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: sk } })
  );
  return Item || null;
}

export async function query({ pk, skPrefix, indexName, gsi1pk, gsi1skPrefix }) {
  const params = { TableName: TABLE_NAME };

  if (indexName === 'GSI1') {
    params.IndexName = 'GSI1';
    params.KeyConditionExpression = 'GSI1PK = :pk';
    params.ExpressionAttributeValues = { ':pk': gsi1pk };
    if (gsi1skPrefix) {
      params.KeyConditionExpression += ' AND begins_with(GSI1SK, :sk)';
      params.ExpressionAttributeValues[':sk'] = gsi1skPrefix;
    }
  } else {
    params.KeyConditionExpression = 'PK = :pk';
    params.ExpressionAttributeValues = { ':pk': pk };
    if (skPrefix) {
      params.KeyConditionExpression += ' AND begins_with(SK, :sk)';
      params.ExpressionAttributeValues[':sk'] = skPrefix;
    }
  }

  const items = [];
  let lastKey;
  do {
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await getDocClient().send(new QueryCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

/**
 * Scan items whose PK begins with one of the given prefixes.
 * Use only for low-cardinality slices (e.g. share links). Avoid on hot paths.
 */
export async function scanByPkPrefixes(prefixes) {
  if (!prefixes || prefixes.length === 0) return [];
  const exprNames = {};
  const exprValues = {};
  const filters = prefixes.map((p, i) => {
    exprValues[`:p${i}`] = p;
    return `begins_with(#pk, :p${i})`;
  });
  exprNames['#pk'] = 'PK';

  const params = {
    TableName: TABLE_NAME,
    FilterExpression: filters.join(' OR '),
    ExpressionAttributeNames: exprNames,
    ExpressionAttributeValues: exprValues,
  };

  const items = [];
  let lastKey;
  do {
    if (lastKey) params.ExclusiveStartKey = lastKey;
    const result = await getDocClient().send(new ScanCommand(params));
    items.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

export async function deleteItem(pk, sk) {
  await getDocClient().send(
    new DeleteCommand({ TableName: TABLE_NAME, Key: { PK: pk, SK: sk } })
  );
}

export async function batchWrite(items) {
  const client = getDocClient();
  // DynamoDB batch limit is 25 items
  for (let i = 0; i < items.length; i += 25) {
    const batch = items.slice(i, i + 25);
    await client.send(
      new BatchWriteCommand({
        RequestItems: {
          [TABLE_NAME]: batch,
        },
      })
    );
  }
}

export { TABLE_NAME };

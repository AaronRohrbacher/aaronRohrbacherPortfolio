/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "aaron-portfolio",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: ["production"],
      home: "aws",
    };
  },
  async run() {
    const isProd = $app.stage === "production";

    // DynamoDB single-table for music data (tracks, permissions, groups)
    const musicTable = new sst.aws.Dynamo("MusicData", {
      fields: {
        PK: "string",
        SK: "string",
        GSI1PK: "string",
        GSI1SK: "string",
      },
      primaryIndex: { hashKey: "PK", rangeKey: "SK" },
      globalIndexes: {
        GSI1: { hashKey: "GSI1PK", rangeKey: "GSI1SK" },
      },
    });

    // Cognito User Pool for music section auth
    const userPool = new sst.aws.CognitoUserPool("MusicAuth", {
      usernames: ["email"],
    });

    const userPoolClient = userPool.addClient("MusicWebClient");

    // Create admin group in Cognito (IaC)
    new aws.cognito.UserGroup("MusicAdminGroup", {
      userPoolId: userPool.id,
      name: "admin",
      description: "Music section administrators",
    });

    // Export table name for local scripts
    const tableName = musicTable.name;

    new sst.aws.Nextjs("Portfolio", {
      link: [musicTable, userPool, userPoolClient],
      domain: isProd
        ? {
            name: "aaronrohrbacher.com",
            aliases: ["www.aaronrohrbacher.com", "music.aaronrohrbacher.com"],
            dns: sst.aws.dns({ zone: "aaronrohrbacher.com" }),
          }
        : undefined,
      environment: {
        NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPool.id,
        NEXT_PUBLIC_COGNITO_CLIENT_ID: userPoolClient.id,
        NEXT_PUBLIC_AWS_REGION: "us-east-2",
        MUSIC_TABLE_NAME: tableName,
        NEXT_PUBLIC_CONNECT_INSTANCE_ID: process.env.CONNECT_INSTANCE_ID ?? "",
        NEXT_PUBLIC_CONNECT_SNIPPET_ID: process.env.NEXT_PUBLIC_CONNECT_SNIPPET_ID ?? "",
      },
    });

    return {
      userPoolId: userPool.id,
      userPoolClientId: userPoolClient.id,
      tableName,
    };
  },
});

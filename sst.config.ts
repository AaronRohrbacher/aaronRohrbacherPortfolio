/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "aaron-portfolio",
      removal: input?.stage === "production" ? "retain" : "remove",
      protect: input?.stage === "production",
      home: "aws",
    };
  },
  async run() {
    const { readFileSync } = await import("node:fs");
    const { resolve: resolvePath } = await import("node:path");
    const isProd = $app.stage === "production";

    // Secrets — set per-stage via:
    //   npx sst secret set <Name> <value> [--stage production]
    // Listed together so it's obvious what needs setting on a fresh deploy.
    const awsAccountId = new sst.Secret("AwsAccountId");
    const connectInstanceId = new sst.Secret("ConnectInstanceId");
    const connectAgentId = new sst.Secret("ConnectAgentId");
    const connectQueueId = new sst.Secret("ConnectQueueId");
    const contactEmailTo = new sst.Secret("ContactEmailTo");
    const connectSnippetId = new sst.Secret("ConnectSnippetId");
    const googleOauthClientId = new sst.Secret("GoogleOauthClientId");
    const googleOauthClientSecret = new sst.Secret("GoogleOauthClientSecret");
    const googleRefreshToken = new sst.Secret("GoogleRefreshToken");
    const calendarEmail = new sst.Secret("CalendarEmail");

    // Amazon Connect lives in us-west-2 (instance alias "doctorbader"). The
    // notify Lambda must be in the same region — Connect's Lambda-association
    // UI only lists functions in the instance's home region.
    const connectRegion = "us-west-2";
    const connectAwsProvider = new aws.Provider("ConnectRegion", {
      region: connectRegion,
    });

    // Notify Lambda — emails Aaron on every Connect flow decision point.
    // Invoked by inbound and customer-queue contact flows.
    const connectNotifyFn = new sst.aws.Function(
      "ConnectNotify",
      {
        handler: "src/functions/connect-notify.handler",
        runtime: "nodejs20.x",
        permissions: [{
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: ["*"],
        }],
        environment: {
          CONTACT_EMAIL_TO: contactEmailTo.value,
          NOTIFY_FROM_EMAIL: "Portfolio Connect <connect@aaronrohrbacher.com>",
        },
      },
      { provider: connectAwsProvider }
    );

    // Let Connect invoke the Lambda. Scoped to just this instance via
    // sourceArn so no other Connect instance (or service) can invoke it.
    new aws.lambda.Permission(
      "ConnectNotifyInvoke",
      {
        action: "lambda:InvokeFunction",
        function: connectNotifyFn.name,
        principal: "connect.amazonaws.com",
        sourceArn: $interpolate`arn:aws:connect:${connectRegion}:${awsAccountId.value}:instance/${connectInstanceId.value}`,
      },
      { provider: connectAwsProvider }
    );

    // Schedule-call Lambda — hits Google Calendar API to list open slots and
    // book meetings during chat with a visitor. Invoked by inbound flow
    // when the visitor picks "4 — Schedule".
    const scheduleCallFn = new sst.aws.Function(
      "ScheduleCall",
      {
        handler: "src/functions/schedule-call.handler",
        runtime: "nodejs20.x",
        timeout: "10 seconds",
        environment: {
          GOOGLE_OAUTH_CLIENT_ID: googleOauthClientId.value,
          GOOGLE_OAUTH_CLIENT_SECRET: googleOauthClientSecret.value,
          GOOGLE_REFRESH_TOKEN: googleRefreshToken.value,
          CALENDAR_EMAIL: calendarEmail.value,
        },
      },
      { provider: connectAwsProvider }
    );

    new aws.lambda.Permission(
      "ScheduleCallInvoke",
      {
        action: "lambda:InvokeFunction",
        function: scheduleCallFn.name,
        principal: "connect.amazonaws.com",
        sourceArn: $interpolate`arn:aws:connect:${connectRegion}:${awsAccountId.value}:instance/${connectInstanceId.value}`,
      },
      { provider: connectAwsProvider }
    );

    // Associate Lambdas with the Connect instance so contact flows may invoke
    // them. Without this, InvokeLambdaFunction actions fail at runtime.
    new aws.connect.LambdaFunctionAssociation(
      "ConnectNotifyAssoc",
      {
        instanceId: connectInstanceId.value,
        functionArn: connectNotifyFn.arn,
      },
      { provider: connectAwsProvider }
    );
    new aws.connect.LambdaFunctionAssociation(
      "ScheduleCallAssoc",
      {
        instanceId: connectInstanceId.value,
        functionArn: scheduleCallFn.arn,
      },
      { provider: connectAwsProvider }
    );

    // Contact flows — templated JSONs in src/connect/flows/.
    // Substitutes secrets + the notify Lambda ARN (Pulumi output).
    // Pulumi orders flow creation after the Lambda is ready automatically.
    const buildFlowContent = (relPath: string) =>
      $output([
        connectNotifyFn.arn,
        scheduleCallFn.arn,
        awsAccountId.value,
        connectInstanceId.value,
        connectAgentId.value,
        connectQueueId.value,
      ]).apply(([notifyArn, scheduleArn, accountId, instanceId, agentId, queueId]) => {
        const raw = readFileSync(resolvePath(relPath), "utf8");
        const filled = raw
          .replaceAll("{{AWS_ACCOUNT_ID}}", accountId)
          .replaceAll("{{CONNECT_INSTANCE_ID}}", instanceId)
          .replaceAll("{{CONNECT_AGENT_ID}}", agentId)
          .replaceAll("{{CONNECT_QUEUE_ID}}", queueId)
          .replaceAll("{{NOTIFY_LAMBDA_ARN}}", notifyArn)
          .replaceAll("{{SCHEDULE_LAMBDA_ARN}}", scheduleArn);
        // Re-serialize to compact JSON. Also validates the file parses.
        return JSON.stringify(JSON.parse(filled));
      });

    new aws.connect.ContactFlow(
      "PortfolioInboundFlow",
      {
        instanceId: connectInstanceId.value,
        name: "Aaron Portfolio — Inbound",
        type: "CONTACT_FLOW",
        description: "First-contact experience (portfolio site)",
        content: buildFlowContent("src/connect/flows/inbound.json"),
      },
      { provider: connectAwsProvider }
    );

    new aws.connect.ContactFlow(
      "PortfolioCustomerQueueFlow",
      {
        instanceId: connectInstanceId.value,
        name: "Aaron Portfolio — Customer Queue",
        type: "CUSTOMER_QUEUE",
        description: "Queue wait + leave-a-message (portfolio site)",
        content: buildFlowContent("src/connect/flows/customer-queue.json"),
      },
      { provider: connectAwsProvider }
    );

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
        NEXT_PUBLIC_CONNECT_INSTANCE_ID: connectInstanceId.value,
        NEXT_PUBLIC_CONNECT_SNIPPET_ID: connectSnippetId.value,
      },
    });

    return {
      userPoolId: userPool.id,
      userPoolClientId: userPoolClient.id,
      tableName,
      connectNotifyArn: connectNotifyFn.arn,
    };
  },
});

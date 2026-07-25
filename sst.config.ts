/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: "aaron-portfolio",
      removal: input?.stage === "production" ? "retain" : "remove",
      // protect: input?.stage === "production",
      home: "aws",
    };
  },
  async run() {
    const { readFileSync } = await import("node:fs");
    const { resolve: resolvePath } = await import("node:path");
    const { config: loadEnv } = await import("dotenv");
    loadEnv({ path: ".env.local" });
    const isProd = $app.stage === "production";

    // Config read from .env.local
    const awsAccountId = process.env.AWS_ACCOUNT_ID!;
    const connectInstanceId = process.env.CONNECT_INSTANCE_ID!;
    const connectAgentId = process.env.CONNECT_AGENT_ID!;
    const connectQueueId = process.env.CONNECT_QUEUE_ID!;
    const contactEmailTo = process.env.CONTACT_EMAIL_TO!;
    const connectSnippetId = process.env.CONNECT_SNIPPET_ID!;
    const connectSecurityKey = process.env.CONNECT_SECURITY_KEY!;
    const connectWidgetId = process.env.CONNECT_WIDGET_ID!;
    const connectContactFlowId = process.env.CONNECT_CONTACT_FLOW_ID!;
    const connectVoiceFlowId = process.env.CONNECT_VOICE_FLOW_ID!;
    const googleOauthClientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
    const googleOauthClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
    const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN!;
    const calendarEmail = process.env.CALENDAR_EMAIL!;

    // Music S3 bucket lives in us-east-2. BucketPolicy must target same region.
    const musicAwsProvider = new aws.Provider("MusicRegion", {
      region: "us-east-2",
    });

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
        runtime: "nodejs24.x",
        permissions: [{
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: ["*"],
        }],
        environment: {
          CONTACT_EMAIL_TO: contactEmailTo,
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
        sourceArn: `arn:aws:connect:${connectRegion}:${awsAccountId}:instance/${connectInstanceId}`,
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
        runtime: "nodejs24.x",
        timeout: "10 seconds",
        environment: {
          GOOGLE_OAUTH_CLIENT_ID: googleOauthClientId,
          GOOGLE_OAUTH_CLIENT_SECRET: googleOauthClientSecret,
          GOOGLE_REFRESH_TOKEN: googleRefreshToken,
          CALENDAR_EMAIL: calendarEmail,
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
        sourceArn: `arn:aws:connect:${connectRegion}:${awsAccountId}:instance/${connectInstanceId}`,
      },
      { provider: connectAwsProvider }
    );

    // Associate Lambdas with the Connect instance so contact flows may invoke
    // them. Without this, InvokeLambdaFunction actions fail at runtime.
    const notifyAssoc = new aws.connect.LambdaFunctionAssociation(
      "ConnectNotifyAssoc",
      {
        instanceId: connectInstanceId,
        functionArn: connectNotifyFn.arn,
      },
      { provider: connectAwsProvider }
    );
    const scheduleAssoc = new aws.connect.LambdaFunctionAssociation(
      "ScheduleCallAssoc",
      {
        instanceId: connectInstanceId,
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
      ]).apply(([notifyArn, scheduleArn]) => {
        const raw = readFileSync(resolvePath(relPath), "utf8");
        const filled = raw
          .replaceAll("{{AWS_ACCOUNT_ID}}", awsAccountId)
          .replaceAll("{{CONNECT_INSTANCE_ID}}", connectInstanceId)
          .replaceAll("{{CONNECT_AGENT_ID}}", connectAgentId)
          .replaceAll("{{CONNECT_QUEUE_ID}}", connectQueueId)
          .replaceAll("{{NOTIFY_LAMBDA_ARN}}", notifyArn)
          .replaceAll("{{SCHEDULE_LAMBDA_ARN}}", scheduleArn)
          .replaceAll("{{LEX_MENU_BOT_ARN}}", "arn:aws:lex:us-west-2:544012685056:bot-alias/TK6ILFTEFS/N2JESWLMTE")
          .replaceAll("{{LEX_TEXT_BOT_ARN}}", "arn:aws:lex:us-west-2:544012685056:bot-alias/FFIJF9WDPZ/P7SORVWGGM");
        // Strip Metadata (Connect API rejects it) and re-serialize to compact JSON.
        const parsed = JSON.parse(filled);
        delete parsed.Metadata;
        return JSON.stringify(parsed);
      });

    new aws.connect.ContactFlow(
      "PortfolioInboundFlow",
      {
        instanceId: connectInstanceId,
        name: "Aaron Portfolio — Inbound",
        type: "CONTACT_FLOW",
        description: "First-contact experience (portfolio site)",
        content: buildFlowContent("src/connect/flows/inbound.json"),
      },
      { provider: connectAwsProvider, dependsOn: [notifyAssoc, scheduleAssoc] }
    );

    // WebRTC (voice + video) entry flow. VOICE-channel-compatible — the
    // chat inbound flow uses MessageParticipant + Lex actions that orphan
    // a VOICE contact (never routes to queue, no agent alert).
    new aws.connect.ContactFlow(
      "PortfolioWebRTCFlow",
      {
        instanceId: connectInstanceId,
        name: "Aaron Portfolio — Call Inbound",
        type: "CONTACT_FLOW",
        description: "Voice + video (WebRTC) entry flow",
        content: buildFlowContent("src/connect/flows/webrtc-voice.json"),
      },
      { provider: connectAwsProvider }
    );

    new aws.connect.ContactFlow(
      "PortfolioCustomerQueueFlow",
      {
        instanceId: connectInstanceId,
        name: "Aaron Portfolio — Customer Queue",
        type: "CUSTOMER_QUEUE",
        description: "Queue wait + leave-a-message (portfolio site)",
        content: buildFlowContent("src/connect/flows/customer-queue.json"),
      },
      { provider: connectAwsProvider, dependsOn: [notifyAssoc, scheduleAssoc] }
    );

    // S3 bucket for the PortaPuter Windows installer (.exe). Lives in
    // us-west-2 — its own provider so the bucket's region is explicit and
    // doesn't drift if Music's region ever moves. Private — signed GET
    // URLs are issued by /api/portaputer/download after logging the
    // click, so the .exe never has to be public.
    const portaputerRegion = "us-west-2";
    const portaputerAwsProvider = new aws.Provider("PortaputerRegion", {
      region: portaputerRegion,
    });
    const portaputerBucket = new sst.aws.Bucket(
      "PortaputerInstallers",
      {},
      { provider: portaputerAwsProvider },
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

    // ── CloudFront CDN for music S3 bucket ──────────────────────────────────
    // Serves audio files from edge with heavy caching so S3 latency is a
    // non-issue. The stream API route redirects to this CDN after auth.

    const musicOac = new aws.cloudfront.OriginAccessControl("MusicOAC", {
      name: `music-oac-${$app.stage}`,
      originAccessControlOriginType: "s3",
      signingBehavior: "always",
      signingProtocol: "sigv4",
    });

    const musicCachePolicy = new aws.cloudfront.CachePolicy("MusicCachePolicy", {
      name: `music-cache-${$app.stage}`,
      defaultTtl: 604800,     // 7 days
      maxTtl: 31536000,       // 365 days
      minTtl: 86400,          // 1 day — keep cached even if origin says otherwise
      parametersInCacheKeyAndForwardedToOrigin: {
        cookiesConfig: { cookieBehavior: "none" },
        headersConfig: { headerBehavior: "none" },
        queryStringsConfig: { queryStringBehavior: "none" },
      },
    });

    const musicCorsPolicy = new aws.cloudfront.ResponseHeadersPolicy(
      "MusicCorsPolicy",
      {
        name: `music-cors-${$app.stage}`,
        corsConfig: {
          accessControlAllowCredentials: false,
          accessControlAllowHeaders: { items: ["*"] },
          accessControlAllowMethods: { items: ["GET", "HEAD"] },
          accessControlAllowOrigins: {
            items: isProd
              ? [
                  "https://aaronrohrbacher.com",
                  "https://www.aaronrohrbacher.com",
                  "https://music.aaronrohrbacher.com",
                ]
              : ["*"],
          },
          accessControlMaxAgeSec: 86400,
          originOverride: true,
        },
      },
    );

    const musicCdn = new aws.cloudfront.Distribution("MusicCDN", {
      origins: [
        {
          domainName: "musicsforu.s3.us-east-2.amazonaws.com",
          originId: "musicS3",
          originAccessControlId: musicOac.id,
        },
      ],
      enabled: true,
      comment: `Music CDN (${$app.stage})`,
      defaultCacheBehavior: {
        allowedMethods: ["GET", "HEAD"],
        cachedMethods: ["GET", "HEAD"],
        targetOriginId: "musicS3",
        viewerProtocolPolicy: "redirect-to-https",
        cachePolicyId: musicCachePolicy.id,
        responseHeadersPolicyId: musicCorsPolicy.id,
        compress: true,
      },
      restrictions: { geoRestriction: { restrictionType: "none" } },
      viewerCertificate: { cloudfrontDefaultCertificate: true },
    });

    // Grant CloudFront OAC read access to the music bucket
    new aws.s3.BucketPolicy(
      "MusicBucketPolicy",
      {
        bucket: "musicsforu",
        policy: musicCdn.arn.apply((arn) =>
          JSON.stringify({
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "cloudfront.amazonaws.com" },
                Action: "s3:GetObject",
                Resource: "arn:aws:s3:::musicsforu/*",
                Condition: { StringEquals: { "AWS:SourceArn": arn } },
              },
            ],
          }),
        ),
      },
      { provider: musicAwsProvider },
    );

    new sst.aws.Nextjs("Portfolio", {
      link: [musicTable, userPool, userPoolClient, portaputerBucket],
      permissions: [
        {
          actions: ["s3:GetObject", "s3:ListBucket", "s3:PutObject"],
          resources: [
            "arn:aws:s3:::musicsforu",
            "arn:aws:s3:::musicsforu/*",
          ],
        },
        {
          actions: ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"],
          resources: [
            portaputerBucket.arn,
            $interpolate`${portaputerBucket.arn}/*`,
          ],
        },
        {
          actions: [
            "connect:GetCurrentMetricData",
            "connect:StartChatContact",
            "connect:StartWebRTCContact",
          ],
          resources: [
            `arn:aws:connect:${connectRegion}:${awsAccountId}:instance/${connectInstanceId}`,
            `arn:aws:connect:${connectRegion}:${awsAccountId}:instance/${connectInstanceId}/*`,
          ],
        },
        {
          actions: ["ses:SendEmail", "ses:SendRawEmail"],
          resources: ["*"],
        },
      ],
      domain: isProd
        ? {
            name: "aaronrohrbacher.com",
            // www 301-redirects to the apex (a true HTTP redirect, not a
            // content-serving alias) so Google stops flagging www as a
            // duplicate/alternate page. music + portaputer stay as aliases
            // because middleware.js serves real content under those hosts.
            redirects: ["www.aaronrohrbacher.com"],
            aliases: ["music.aaronrohrbacher.com", "portaputer.aaronrohrbacher.com"],
            // override: true lets SST replace pre-existing Route53 records
            // (e.g. when migrating www from an alias to a redirect) instead of
            // failing with "record already exists". Avoids manual DNS surgery
            // and the downtime that comes with deleting records by hand.
            dns: sst.aws.dns({ zone: "Z0895814ZUITIQOAPVHT", override: true }),
          }
        : undefined,
      environment: {
        NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPool.id,
        NEXT_PUBLIC_COGNITO_CLIENT_ID: userPoolClient.id,
        NEXT_PUBLIC_AWS_REGION: "us-west-2",
        MUSIC_TABLE_NAME: tableName,
        NEXT_PUBLIC_CONNECT_WIDGET_ID: connectWidgetId,
        NEXT_PUBLIC_CONNECT_SNIPPET_ID: connectSnippetId,
        CONNECT_SECURITY_KEY: connectSecurityKey,
        CONNECT_WIDGET_ID: connectWidgetId,
        CONNECT_INSTANCE_ID: connectInstanceId,
        CONNECT_AGENT_ID: connectAgentId,
        CONNECT_QUEUE_ID: connectQueueId,
        CONNECT_CONTACT_FLOW_ID: connectContactFlowId,
        CONNECT_VOICE_FLOW_ID: connectVoiceFlowId,
        MUSIC_CDN_DOMAIN: musicCdn.domainName,
        PORTAPUTER_S3_BUCKET: portaputerBucket.name,
        PORTAPUTER_S3_REGION: portaputerRegion,
        NEXT_PUBLIC_MODELS_URL: "https://aaron-portfolio-models.s3.us-west-2.amazonaws.com",
        CONTACT_EMAIL_TO: contactEmailTo,
        NOTIFY_FROM_EMAIL: "Portfolio Connect <connect@aaronrohrbacher.com>",
      },
    });

    return {
      userPoolId: userPool.id,
      userPoolClientId: userPoolClient.id,
      tableName,
      musicCdnDomain: musicCdn.domainName,
      connectNotifyArn: connectNotifyFn.arn,
      portaputerBucket: portaputerBucket.name,
    };
  },
});

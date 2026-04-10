#!/usr/bin/env node
// Creates and deploys a Lex V2 bot for the Connect chat flows.
// Two modes: "menu" selections (1-4) and "text" free-form input collection.
// Uses a single bot with both intent types.

import {
  LexModelsV2Client,
  CreateBotCommand,
  CreateBotLocaleCommand,
  CreateIntentCommand,
  UpdateIntentCommand,
  CreateSlotTypeCommand,
  CreateSlotCommand,
  BuildBotLocaleCommand,
  DescribeBotLocaleCommand,
  CreateBotVersionCommand,
  CreateBotAliasCommand,
  ListBotsCommand,
  DeleteBotCommand,
  ListBotAliasesCommand,
  DescribeBotAliasCommand,
} from "@aws-sdk/client-lex-models-v2";

const REGION = "us-west-2";
const BOT_NAME = "AABot";
const ROLE_ARN = "arn:aws:iam::544012685056:role/aws-service-role/lexv2.amazonaws.com/AWSServiceRoleForLexV2Bots_6B2W12S6OE9";

const client = new LexModelsV2Client({ region: REGION });

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForLocale(botId, version, status, maxWait = 120000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const resp = await client.send(
      new DescribeBotLocaleCommand({
        botId,
        botVersion: version,
        localeId: "en_US",
      })
    );
    console.log(`  Locale status: ${resp.botLocaleStatus}`);
    if (resp.botLocaleStatus === status) return resp;
    if (resp.botLocaleStatus === "Failed") {
      console.error("  Build failed:", resp.failureReasons);
      throw new Error("Bot locale build failed");
    }
    await sleep(5000);
  }
  throw new Error(`Timeout waiting for locale status ${status}`);
}

async function main() {
  // Check for existing bot
  const bots = await client.send(new ListBotsCommand({}));
  const existing = bots.botSummaries?.find((b) => b.botName === BOT_NAME);

  let botId;

  if (existing) {
    console.log(`Bot "${BOT_NAME}" exists: ${existing.botId} (status: ${existing.botStatus})`);
    botId = existing.botId;

    // Check for existing alias
    const aliases = await client.send(
      new ListBotAliasesCommand({ botId })
    );
    const liveAlias = aliases.botAliasSummaries?.find(
      (a) => a.botAliasName === "live"
    );
    if (liveAlias) {
      const aliasDetail = await client.send(
        new DescribeBotAliasCommand({
          botId,
          botAliasId: liveAlias.botAliasId,
        })
      );
      console.log(`Alias "live" exists: ${liveAlias.botAliasId}`);
      console.log(
        `  AliasArn: arn:aws:lex:${REGION}:544012685056:bot-alias/${botId}/${liveAlias.botAliasId}`
      );
      console.log("Bot is already set up. Delete it first if you want to recreate.");
      return;
    }
  }

  if (!existing) {
    // Step 1: Create bot
    console.log("Creating bot...");
    const bot = await client.send(
      new CreateBotCommand({
        botName: BOT_NAME,
        description: "Portfolio chat flow bot — handles menu selections and text input collection",
        roleArn: ROLE_ARN,
        dataPrivacy: { childDirected: false },
        idleSessionTTLInSeconds: 300,
        botType: "Bot",
      })
    );
    botId = bot.botId;
    console.log(`  Bot ID: ${botId}`);
    await sleep(2000);
  }

  // Step 2: Create locale
  console.log("Creating en_US locale...");
  try {
    await client.send(
      new CreateBotLocaleCommand({
        botId,
        botVersion: "DRAFT",
        localeId: "en_US",
        nluIntentConfidenceThreshold: 0.4,
      })
    );
  } catch (e) {
    if (e.name === "ConflictException") {
      console.log("  Locale already exists, continuing...");
    } else throw e;
  }
  await sleep(2000);

  // Step 3: Create menu intents (Option1-4)
  const menuIntents = [
    {
      name: "SelectOne",
      utterances: ["1", "one", "first", "option 1", "the first one"],
    },
    {
      name: "SelectTwo",
      utterances: ["2", "two", "second", "option 2", "the second one"],
    },
    {
      name: "SelectThree",
      utterances: ["3", "three", "third", "option 3", "the third one"],
    },
    {
      name: "SelectFour",
      utterances: ["4", "four", "fourth", "option 4", "the fourth one"],
    },
  ];

  for (const intent of menuIntents) {
    console.log(`Creating intent: ${intent.name}...`);
    try {
      await client.send(
        new CreateIntentCommand({
          botId,
          botVersion: "DRAFT",
          localeId: "en_US",
          intentName: intent.name,
          sampleUtterances: intent.utterances.map((u) => ({ utterance: u })),
          intentClosingSetting: {
            closingResponse: {
              messageGroups: [
                {
                  message: { plainTextMessage: { value: "Got it." } },
                },
              ],
            },
            isActive: true,
          },
        })
      );
    } catch (e) {
      if (e.name === "ConflictException") {
        console.log(`  Intent ${intent.name} already exists, skipping...`);
      } else throw e;
    }
  }

  // Step 4: Create text collection intent with FreeFormInput slot
  console.log("Creating CollectText intent...");
  let collectTextIntentId;
  try {
    const collectIntent = await client.send(
      new CreateIntentCommand({
        botId,
        botVersion: "DRAFT",
        localeId: "en_US",
        intentName: "CollectText",
        sampleUtterances: [
          { utterance: "{userInput}" },
          { utterance: "my name is {userInput}" },
          { utterance: "it's {userInput}" },
          { utterance: "call me {userInput}" },
          { utterance: "{userInput} please" },
          { utterance: "sure {userInput}" },
          { utterance: "yes {userInput}" },
        ],
        intentClosingSetting: {
          closingResponse: {
            messageGroups: [
              {
                message: { plainTextMessage: { value: "Thanks!" } },
              },
            ],
          },
          isActive: true,
        },
      })
    );
    collectTextIntentId = collectIntent.intentId;
  } catch (e) {
    if (e.name === "ConflictException") {
      console.log("  CollectText intent already exists, skipping slot creation...");
    } else throw e;
  }

  if (collectTextIntentId) {
    // Create custom slot type for free-form text
    console.log("Creating FreeText slot type...");
    let slotTypeId;
    try {
      const slotType = await client.send(
        new CreateSlotTypeCommand({
          botId,
          botVersion: "DRAFT",
          localeId: "en_US",
          slotTypeName: "FreeText",
          valueSelectionSetting: {
            resolutionStrategy: "OriginalValue",
          },
          slotTypeValues: [
            { sampleValue: { value: "hello" } },
            { sampleValue: { value: "test" } },
          ],
        })
      );
      slotTypeId = slotType.slotTypeId;
    } catch (e) {
      if (e.name === "ConflictException") {
        console.log("  FreeText slot type already exists");
      } else throw e;
    }

    // Create the slot on the CollectText intent
    if (slotTypeId) {
      console.log("Creating userInput slot...");
      await client.send(
        new CreateSlotCommand({
          botId,
          botVersion: "DRAFT",
          localeId: "en_US",
          intentId: collectTextIntentId,
          slotName: "userInput",
          slotTypeId,
          valueElicitationSetting: {
            slotConstraint: "Required",
            promptSpecification: {
              messageGroups: [
                {
                  message: {
                    plainTextMessage: { value: "Please go ahead:" },
                  },
                },
              ],
              maxRetries: 2,
            },
          },
        })
      );
    }
  }

  // Step 5: Update FallbackIntent to not hang
  console.log("Configuring FallbackIntent...");
  // List intents to find FallbackIntent ID
  const { default: lexList } = await import("@aws-sdk/client-lex-models-v2");
  const listCmd = new (await import("@aws-sdk/client-lex-models-v2")).ListIntentsCommand({
    botId,
    botVersion: "DRAFT",
    localeId: "en_US",
  });
  const intentsResp = await client.send(listCmd);
  const fallbackIntent = intentsResp.intentSummaries?.find(
    (i) => i.intentName === "FallbackIntent"
  );
  if (fallbackIntent) {
    console.log(`  FallbackIntent ID: ${fallbackIntent.intentId}`);
  }

  // Step 6: Build the locale
  console.log("Building bot locale...");
  await client.send(
    new BuildBotLocaleCommand({
      botId,
      botVersion: "DRAFT",
      localeId: "en_US",
    })
  );

  console.log("Waiting for build to complete...");
  await waitForLocale(botId, "DRAFT", "Built");

  // Step 7: Create a version
  console.log("Creating bot version...");
  const version = await client.send(
    new CreateBotVersionCommand({
      botId,
      botVersionLocaleSpecification: {
        en_US: { sourceBotVersion: "DRAFT" },
      },
    })
  );
  const botVersion = version.botVersion;
  console.log(`  Bot version: ${botVersion}`);

  // Wait for version to be available
  await sleep(5000);
  await waitForLocale(botId, botVersion, "Built");

  // Step 8: Create alias
  console.log("Creating 'live' alias...");
  const alias = await client.send(
    new CreateBotAliasCommand({
      botId,
      botAliasName: "live",
      botVersion,
      botAliasLocaleSettings: {
        en_US: { enabled: true },
      },
    })
  );
  const aliasId = alias.botAliasId;
  const aliasArn = `arn:aws:lex:${REGION}:544012685056:bot-alias/${botId}/${aliasId}`;
  console.log(`  Alias ID: ${aliasId}`);
  console.log(`  Alias ARN: ${aliasArn}`);

  // Step 9: Output the ARN for use in flows
  console.log("\n=== BOT READY ===");
  console.log(`Bot ID: ${botId}`);
  console.log(`Alias ARN: ${aliasArn}`);
  console.log(
    "\nUse this ARN in ConnectParticipantWithLexBot actions in your contact flows."
  );
  console.log(
    "Next: associate this bot with your Connect instance via aws connect associate-lex-bot"
  );
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});

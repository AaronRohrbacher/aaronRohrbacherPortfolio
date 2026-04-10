#!/usr/bin/env node
// Validates Amazon Connect contact flow JSON by attempting to create
// a temporary flow via the API. If the content is invalid, the API
// returns InvalidContactFlowException with a `problems` list.
// If valid, the temp flow is deleted immediately.
//
// Usage: node scripts/validate-flows.mjs [inbound|queue|both]

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import {
  ConnectClient,
  CreateContactFlowCommand,
  DeleteContactFlowCommand,
} from "@aws-sdk/client-connect";

loadEnv({ path: ".env.local" });

const INSTANCE_ID = process.env.CONNECT_INSTANCE_ID;
const AWS_ACCOUNT_ID = process.env.AWS_ACCOUNT_ID;
const AGENT_ID = process.env.CONNECT_AGENT_ID;
const QUEUE_ID = process.env.CONNECT_QUEUE_ID;

// Use production Lambda ARNs (they're what's associated with the Connect instance)
const NOTIFY_ARN =
  "arn:aws:lambda:us-west-2:544012685056:function:aaron-portfolio-production-ConnectNotifyFunction-bbmnucwf";
const SCHEDULE_ARN =
  "arn:aws:lambda:us-west-2:544012685056:function:aaron-portfolio-production-ScheduleCallFunction-vvmwxkak";

if (!INSTANCE_ID || !AWS_ACCOUNT_ID || !AGENT_ID || !QUEUE_ID) {
  console.error("Missing required env vars in .env.local");
  process.exit(1);
}

const client = new ConnectClient({ region: "us-west-2" });

function buildContent(relPath) {
  const raw = readFileSync(resolve(relPath), "utf8");
  const filled = raw
    .replaceAll("{{AWS_ACCOUNT_ID}}", AWS_ACCOUNT_ID)
    .replaceAll("{{CONNECT_INSTANCE_ID}}", INSTANCE_ID)
    .replaceAll("{{CONNECT_AGENT_ID}}", AGENT_ID)
    .replaceAll("{{CONNECT_QUEUE_ID}}", QUEUE_ID)
    .replaceAll("{{NOTIFY_LAMBDA_ARN}}", NOTIFY_ARN)
    .replaceAll("{{SCHEDULE_LAMBDA_ARN}}", SCHEDULE_ARN)
    .replaceAll("{{LEX_MENU_BOT_ARN}}", "arn:aws:lex:us-west-2:544012685056:bot-alias/TK6ILFTEFS/N2JESWLMTE")
    .replaceAll("{{LEX_TEXT_BOT_ARN}}", "arn:aws:lex:us-west-2:544012685056:bot-alias/FFIJF9WDPZ/P7SORVWGGM");
  const parsed = JSON.parse(filled);
  delete parsed.Metadata;
  return JSON.stringify(parsed);
}

async function validateFlow(name, type, relPath) {
  const testName = `__VALIDATION_TEST__ ${name} ${Date.now()}`;
  const content = buildContent(relPath);

  // Quick local checks
  const parsed = JSON.parse(content);
  const ids = new Set(parsed.Actions.map((a) => a.Identifier));
  console.log(`\n── ${name} (${type}) ──`);
  console.log(`  Actions: ${parsed.Actions.length}`);
  console.log(`  StartAction: ${parsed.StartAction} (exists: ${ids.has(parsed.StartAction)})`);

  // Check all transition references
  const broken = [];
  for (const action of parsed.Actions) {
    const transitions = action.Transitions;
    if (!transitions) continue;
    if (transitions.NextAction && !ids.has(transitions.NextAction)) {
      broken.push(`${action.Identifier} → NextAction "${transitions.NextAction}" not found`);
    }
    for (const cond of transitions.Conditions ?? []) {
      if (cond.NextAction && !ids.has(cond.NextAction)) {
        broken.push(`${action.Identifier} → Condition "${cond.NextAction}" not found`);
      }
    }
    for (const err of transitions.Errors ?? []) {
      if (err.NextAction && !ids.has(err.NextAction)) {
        broken.push(`${action.Identifier} → Error "${err.NextAction}" not found`);
      }
    }
  }
  if (broken.length) {
    console.log(`  ⚠ Broken references:`);
    broken.forEach((b) => console.log(`    - ${b}`));
  } else {
    console.log(`  ✓ All action references valid`);
  }

  // API validation via create-contact-flow
  console.log(`  Calling CreateContactFlow (temp name: ${testName})...`);
  try {
    const result = await client.send(
      new CreateContactFlowCommand({
        InstanceId: INSTANCE_ID,
        Name: testName,
        Type: type,
        Content: content,
      })
    );
    console.log(`  ✓ VALID — flow created (${result.ContactFlowId})`);

    // Clean up
    try {
      await client.send(
        new DeleteContactFlowCommand({
          InstanceId: INSTANCE_ID,
          ContactFlowId: result.ContactFlowId,
        })
      );
      console.log(`  ✓ Temp flow deleted`);
    } catch (delErr) {
      console.log(`  ⚠ Could not delete temp flow: ${delErr.message}`);
      console.log(`    Manual cleanup needed: ${testName}`);
    }
    return true;
  } catch (err) {
    if (err.name === "InvalidContactFlowException") {
      console.log(`  ✗ INVALID — ${err.message}`);
      if (err.problems) {
        console.log(`  Problems:`);
        for (const p of err.problems) {
          console.log(`    - ${JSON.stringify(p)}`);
        }
      }
      // Try to get more detail from the raw error
      if (err.$metadata) {
        console.log(`  HTTP status: ${err.$metadata.httpStatusCode}`);
      }
      return false;
    }
    throw err;
  }
}

const arg = process.argv[2] ?? "both";
let ok = true;

if (arg === "inbound" || arg === "both") {
  const valid = await validateFlow(
    "Inbound",
    "CONTACT_FLOW",
    "src/connect/flows/inbound.json"
  );
  if (!valid) ok = false;
}

if (arg === "queue" || arg === "both") {
  const valid = await validateFlow(
    "Customer Queue",
    "CUSTOMER_QUEUE",
    "src/connect/flows/customer-queue.json"
  );
  if (!valid) ok = false;
}

console.log(ok ? "\n✓ All flows valid" : "\n✗ Validation failed");
process.exit(ok ? 0 : 1);

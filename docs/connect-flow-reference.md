# Amazon Connect Contact Flow Reference (Chat)

This document captures hard-won findings about building Amazon Connect contact
flows for the **chat channel**. Many actions behave differently (or not at all)
for chat vs. voice. The official docs are scattered across the Admin Guide and
Flow Language API Reference — this consolidates what matters for this project.

## Critical: GetParticipantInput Does NOT Work for Chat

`GetParticipantInput` is the "Get customer input" block in the Connect flow
editor. **For chat contacts, it immediately takes the Error branch unless a Lex
bot is configured.**

- The `StoreInput`, `InputTimeLimitSeconds`, DTMF digit-matching conditions
  (`Equals "1"`, `Equals "2"`, etc.) — all of this is **voice/DTMF only**.
- For chat, you MUST use one of the alternatives below.
- The API validation (`CreateContactFlow`) will accept the JSON with
  `StoreInput`/`InputTimeLimitSeconds` — it just won't work at runtime for chat.

Sources:
- https://docs.aws.amazon.com/connect/latest/adminguide/get-customer-input.html
- https://docs.aws.amazon.com/connect/latest/APIReference/participant-actions-getparticipantinput.html

## Collecting Input from Chat Customers

### Option A: ConnectParticipantWithLexBot (structured input)

The chat-compatible equivalent of `GetParticipantInput`. Delegates to a Lex V2
bot which processes the customer's text and returns a matched intent.

```json
{
  "Type": "ConnectParticipantWithLexBot",
  "Parameters": {
    "Text": "How would you like to connect?",
    "LexV2Bot": {
      "AliasArn": "arn:aws:lex:REGION:ACCOUNT:bot-alias/BOT_ID/ALIAS_ID"
    },
    "LexSessionAttributes": {},
    "LexTimeoutSeconds": { "Text": 60 }
  },
  "Transitions": {
    "NextAction": "fallback-action",
    "Conditions": [
      { "NextAction": "voice-path",    "Condition": { "Operator": "Equals", "Operands": ["VoiceCall"] } },
      { "NextAction": "video-path",    "Condition": { "Operator": "Equals", "Operands": ["VideoCall"] } }
    ],
    "Errors": [
      { "NextAction": "error-path", "ErrorType": "NoMatchingCondition" },
      { "NextAction": "error-path", "ErrorType": "NoMatchingError" },
      { "NextAction": "error-path", "ErrorType": "InputTimeLimitExceeded" }
    ]
  }
}
```

Conditions match on **Lex intent names**, not raw text. You train the Lex bot
with sample utterances (e.g., "1", "voice", "call him", "voice call" all map to
a `VoiceCall` intent).

### Option B: ShowView (interactive UI, chat-only)

Renders clickable UI elements (cards, list pickers, forms) directly in the chat
widget. Chat-only — voice contacts take the Error branch.

```json
{
  "Type": "ShowView",
  "Parameters": {
    "ViewResource": {
      "Id": "arn:aws:connect:REGION:ACCOUNT:instance/INSTANCE_ID/view/VIEW_ID",
      "Version": "1"
    },
    "InvocationTimeLimitSeconds": 400,
    "ViewData": { ... }
  }
}
```

Requires enabling interactive messages in the chat widget config:
```javascript
amazon_connect('supportedMessagingContentTypes', [
  'text/plain',
  'application/vnd.amazonaws.connect.message.interactive',
  'application/vnd.amazonaws.connect.message.interactive.response'
]);
```

Output available at `$.Views.Action` and `$.Views.ViewResultData`.

Available view templates: Detail View, List View, Form View, Confirmation View,
Cards View.

### Option C: Lex-powered Interactive Messages

Lex bots can send interactive messages (List Picker, Quick Reply, Time Picker,
Carousel) in chat. These render as clickable UI elements. Configured in the Lex
bot response, not in the flow JSON.

## Wait Action

**Correct parameter is `TimeLimitSeconds`** (not `TimeoutSeconds` or
`WaitTimeSeconds`). The Flow Language API Reference says `TimeoutSeconds` but
the `CreateContactFlow` API rejects it — `TimeLimitSeconds` is what actually
works.

```json
{
  "Type": "Wait",
  "Parameters": {
    "TimeLimitSeconds": "30"
  },
  "Transitions": {
    "NextAction": "next",
    "Conditions": [
      { "NextAction": "timeout-path",  "Condition": { "Operator": "Equals", "Operands": ["WaitCompleted"] } },
      { "NextAction": "returned-path", "Condition": { "Operator": "Equals", "Operands": ["CustomerReturned"] } }
    ],
    "Errors": [
      { "NextAction": "error-path", "ErrorType": "NoMatchingError" }
    ]
  }
}
```

- Max: 604800 seconds (7 days)
- For chat: `CustomerReturned` event fires when the customer comes back and
  sends a message after leaving. Add it to handle async chat.
- Works in: Inbound flow, Customer queue flow.

## Voicemail from Chat

**There is no native "voicemail from chat" in Amazon Connect.**

- Setting `callType: "voicemail"` as a contact attribute does nothing — it's
  just a label, not a feature trigger.
- The AWS voicemail solution (blog post) is voice-channel-only, using S3 +
  Transcribe + Lambda.
- For chat, "leave a message" (text) is the functional equivalent of voicemail.
  Collect the message text, email/notify the agent.
- If you truly want audio voicemail from chat, you'd need to initiate a WebRTC
  call from the widget (channel switch), which is a separate feature.

**Recommendation**: Remove voicemail as a separate option in chat menus. Replace
with "leave a text message" which the flow already supports.

## Action Channel Compatibility

| Action                         | Voice | Chat  | Notes                                    |
|-------------------------------|-------|-------|------------------------------------------|
| MessageParticipant            | Yes   | Yes   | Text only for chat (no SSML/PromptId)    |
| GetParticipantInput           | Yes   | NO*   | *Only works with Lex bot for chat        |
| ConnectParticipantWithLexBot  | Yes   | Yes   | Primary chat input method                |
| ShowView                      | No    | Yes   | Chat-only interactive UI                 |
| Wait                          | Yes** | Yes   | **Voice needs special config             |
| CheckMetricData               | Yes   | Yes   |                                          |
| Compare                       | Yes   | Yes   |                                          |
| UpdateContactAttributes       | Yes   | Yes   |                                          |
| InvokeLambdaFunction          | Yes   | Yes   |                                          |
| TransferContactToQueue        | Yes   | Yes   |                                          |
| UpdateContactTargetQueue      | Yes   | Yes   | Not allowed in CUSTOMER_QUEUE flow type  |
| DisconnectParticipant         | Yes   | Yes   |                                          |
| Loop prompts                  | Yes   | No    |                                          |
| Store customer input          | Yes   | No    |                                          |

## Flow Validation

AWS has no standalone `ValidateContactFlowContent` API. To validate:

```bash
node scripts/validate-flows.mjs [inbound|queue|both]
```

This script (`scripts/validate-flows.mjs`):
1. Reads the flow JSON and applies template substitutions (same as
   `buildFlowContent()` in `sst.config.ts`)
2. Runs local checks (action reference integrity, StartAction exists)
3. Calls `CreateContactFlow` with a temp name via the AWS SDK
4. If invalid: returns `InvalidContactFlowException` with a `problems` array
   listing every specific issue
5. If valid: deletes the temp flow immediately

**Note**: API validation checks JSON structure only. It does NOT validate
runtime behavior (e.g., it won't tell you that `GetParticipantInput` will error
for chat contacts).

## GetParticipantInput API Parameters (for reference)

When `StoreInput: "False"` (menu/digit selection):
```json
{
  "Text": "prompt text",
  "StoreInput": "False",
  "InputTimeLimitSeconds": "60"
}
```

When `StoreInput: "True"` (collecting free-form input):
```json
{
  "Text": "prompt text",
  "StoreInput": "True",
  "InputTimeLimitSeconds": "120",
  "InputValidation": {
    "CustomValidation": { "MaximumLength": "256" }
  }
}
```

- `ResponseValidation: { ResponseType: "TEXT" }` is NOT a valid parameter
  (rejected by API validation).
- These parameters are required even though they're voice-only in practice.

## CUSTOMER_QUEUE Flow Type Restrictions

The following action types are NOT allowed in `CUSTOMER_QUEUE` flows:
- `TransferContactToQueue`
- `UpdateContactTargetQueue`

These will cause `InvalidContactFlowException` on deploy.

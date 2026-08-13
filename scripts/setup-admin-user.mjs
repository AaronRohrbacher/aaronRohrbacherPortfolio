#!/usr/bin/env node

/**
 * Create the initial admin user in Cognito and add to the admin group.
 *
 * Run after deploying the dev stage:
 *   npx sst shell -- node scripts/setup-admin-user.mjs <email>
 *
 * Or with explicit env vars:
 *   NEXT_PUBLIC_COGNITO_USER_POOL_ID=xxx node scripts/setup-admin-user.mjs <email>
 *
 * Uses ~/.aws/ credentials.
 */

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminSetUserPasswordCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { createInterface } from 'readline';

const REGION = process.env.NEXT_PUBLIC_AWS_REGION || 'us-west-2';
const USER_POOL_ID = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID;

if (!USER_POOL_ID) {
  console.error('NEXT_PUBLIC_COGNITO_USER_POOL_ID not set.');
  console.error('Run with: npx sst shell -- node scripts/setup-admin-user.mjs <email>');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/setup-admin-user.mjs <email>');
  process.exit(1);
}

const client = new CognitoIdentityProviderClient({ region: REGION });

function prompt(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

const password = await prompt('Set password for admin user: ');

if (password.length < 8) {
  console.error('Password must be at least 8 characters.');
  process.exit(1);
}

console.log(`Creating admin user: ${email}`);

try {
  await client.send(
    new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
      ],
      MessageAction: 'SUPPRESS', // Don't send invite email
    })
  );
  console.log('  User created.');
} catch (err) {
  if (err.name === 'UsernameExistsException') {
    console.log('  User already exists, continuing...');
  } else {
    throw err;
  }
}

// Set permanent password (skips the FORCE_CHANGE_PASSWORD state)
await client.send(
  new AdminSetUserPasswordCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
    Password: password,
    Permanent: true,
  })
);
console.log('  Password set.');

// Add to admin group
await client.send(
  new AdminAddUserToGroupCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
    GroupName: 'admin',
  })
);
console.log('  Added to admin group.');

console.log('\nDone! Sign in at /music/login with these credentials.');

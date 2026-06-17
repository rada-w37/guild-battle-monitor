# Step1 Share Functions Deploy Notes

## Deploy Order

1. Confirm Firebase Blaze plan and budget alerts are enabled.
2. Deploy Functions first.
3. Manually backfill `guildShares/{guildId}.guildOwnerUid` for existing shares.
4. Deploy the new client/Hosting.
5. Deploy the closed Firestore Rules last.
6. Verify Owner/Admin/Viewer URLs on real desktop and mobile devices.

Do not close `guildShares/{guildId}` rules before the new client is deployed, because old clients may still read `guildShares` directly.

## Manual Backfill Checklist

1. List the existing target `guildShares/{guildId}` documents.
2. Confirm the Firebase Auth uid for each guild owner.
3. Set only `guildShares/{guildId}.guildOwnerUid` to the confirmed uid.
4. Do not change `adminAccessKey` or `guestAccessKey`.
5. Confirm `world` and `guildName` only if metadata sync is needed.
6. After deploy, confirm the owner can display Admin URL and Viewer URL.
7. Confirm existing Admin URL and Viewer URL still open successfully.

Existing shares without `guildOwnerUid` intentionally reject owner display/save until backfilled. Admin/Viewer URL verification continues to work when the stored access key matches.

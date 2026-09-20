# Apple identifiers (public)

Not secrets. Safe to commit. Team ID is in every signed binary.

**Never put `.p8` keys, issuer secrets, or private keys in this file.** Those stay in
Downloads / Supabase secrets / EAS credentials.

| Field | Value |
|---|---|
| Legal entity | Kumar Holdings LLC |
| Team ID | `UB5Y6U28G5` |
| Bundle ID | `com.remedyappco.ios` |
| App Store name | Remedy: Back Pain Relief |
| App Store Connect Apple ID | `6813745106` |
| Subscription group ID | `22397698` |
| Subscription group display name | Remedy Subscriptions |
| Sign in with Apple Key ID | `4Q9G4B8D4H` |
| APNs Key ID (EAS, active) | `WN8QJ27W2J` |
| APNs Key ID (unused spare) | `VKT8HN5R9W` |
| IAP / App Store Server API Key ID | `KV88KPS274` |
| App Store Connect API Key ID (Superwall) | `B3CS563SP3` |
| Issuer ID | `0865d89d-f28f-41bb-a983-487706d5203d` |

## Product IDs (unchanged — unique per account, not per bundle)

Keep these exact IDs.

- `com.remedyapp.weekly` — 1 week, **7-day** trial, $4.99
- `com.remedyapp.monthly` — 1 month, **14-day** trial, $12.99
- `com.remedyapp.annual` — 1 year, **14-day** trial, $79.99
- `com.remedyapp.weekly.no.trial` — 1 week, no trial, $4.99
- `com.remedyapp.monthly.no.trial` — 1 month, no trial, $12.99
- `com.remedyapp.annual.no.trial` — 1 year, no trial, $79.99

## Private keys (local only)

| Key | Local path (not in git) |
|---|---|
| Sign in with Apple | `C:\Users\rkuma\Downloads\Remedy\updated_new_apple_key\AuthKey_4Q9G4B8D4H.p8` |
| IAP / App Store Server API | `C:\Users\rkuma\Downloads\Remedy\updated_new_IAP_subscription_key\SubscriptionKey_KV88KPS274.p8` |
| APNs | `C:\Users\rkuma\Downloads\Remedy\updated_new_apple_APN_notif_key\AuthKey_VKT8HN5R9W.p8` |
| App Store Connect API (Superwall) | `C:\Users\rkuma\Downloads\Remedy\updated_new_app_store_API_team_key_superwall_app_manager\AuthKey_B3CS563SP3.p8` |

`.gitignore` already blocks `*.p8`.

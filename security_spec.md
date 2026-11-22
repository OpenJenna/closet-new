# Wardrobe & Daily Look Security Specification

## 1. Data Invariants
1. **User Isolation**: A `users/{userId}` document can only be created, read, or updated by the verified authenticated user whose `request.auth.uid == userId`. User listing (`list`) is disabled.
2. **Parent-Anchored Subcollections**: Neither a `WardrobeItem` (`/users/{userId}/items/{itemId}`) nor a `DailyLook` (`/users/{userId}/dailyLooks/{lookId}`) can exist unless the parent `/users/{userId}` document exists and `ownerId == request.auth.uid == userId`.
3. **Immutable Ownership & Temporal Integrity**: `ownerId` and `createdAt` cannot be modified after creation. `createdAt == request.time` on create and `updatedAt == request.time` on update.
4. **Strict Payload Boundaries**: Every string, number, and list field is bounded in type, range, and size (`additionalImages.size() <= 6`, `itemIds.size() >= 1 && itemIds.size() <= 15`, `seasons.size() >= 1 && seasons.size() <= 4`).

## 2. Adversarial Test Payloads ("Dirty Dozen")
1. **Cross-User Item Read**: User B attempts `get` on `/users/userA/items/item1` -> `PERMISSION_DENIED`.
2. **Cross-User List Scraping**: User B attempts `list` on `/users/userA/items` -> `PERMISSION_DENIED`.
3. **Unverified Email Write**: User A with `email_verified: false` attempts `create` on `/users/userA/items/item1` -> `PERMISSION_DENIED`.
4. **Owner Spoofing**: User A attempts `create` on `/users/userA/items/item1` with `ownerId: "userB"` -> `PERMISSION_DENIED`.
5. **Shadow Field Injection**: User A sends `isAdmin: true` in `WardrobeItem` create -> `PERMISSION_DENIED` (`hasOnly` rejection).
6. **ID Poisoning**: User A attempts `create` with `itemId` containing invalid characters or > 128 chars -> `PERMISSION_DENIED` (`isValidId`).
7. **Orphaned Subcollection Write**: User A attempts `create` on `/users/userA/items/item1` before `/users/userA` exists -> `PERMISSION_DENIED` (`exists()` parent gate).
8. **Immutable Field Tampering**: User A attempts `update` changing `ownerId` or `createdAt` -> `PERMISSION_DENIED`.
9. **Client Timestamp Forgery**: User A attempts `create` with `createdAt` not equal to `request.time` -> `PERMISSION_DENIED`.
10. **Negative Price / Invalid Rating**: User A attempts `create` with `price: -5000` or `rating: 9` -> `PERMISSION_DENIED`.
11. **Unbounded Array Exhaustion**: User A attempts `create` on `dailyLooks` with `itemIds` empty or > 15 items -> `PERMISSION_DENIED`.
12. **Blanket User Enumeration**: User A attempts `list` on `/users` -> `PERMISSION_DENIED`.

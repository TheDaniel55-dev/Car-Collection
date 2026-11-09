# Privacy

- No accounts, no analytics, no ads, no third-party requests at runtime (fonts and OCR are self-hosted).
- The collection, photos and settings are stored in IndexedDB on the device. They are never uploaded.
- "Profiles" are separate local collections on the same device (not online accounts). The optional PIN only locks the screen; it does not encrypt the stored data.
- Backups are exported only on request; the encrypted backup uses PBKDF2-SHA256 (250k iterations) + AES-GCM. A forgotten password cannot be recovered.
- The app downloads only static catalogue files from its own host.
- If you publish this app for other people: consider whether you need a short privacy notice in your region (GDPR). Because nothing is collected, this is usually minimal, but it is your responsibility.

Red-Berry server scaffold

This small Express server is a local scaffold for the Red-Berry demo. It provides simple JSON-backed storage and optional Google OAuth via passport.

Quick start

1. Install dependencies:

   ```powershell
   cd server
   npm install
   ```

2. If you want Google OAuth, create credentials in Google Cloud Console and set environment variables:

   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

   Configure the OAuth consent screen and add an Authorized redirect URI, e.g. `http://localhost:3000/auth/google/callback`.

3. Run the server:

   ```powershell
   npm start
   ```

4. Open the front-end (the server also serves the repo root static files):

   http://localhost:3000/Pages/red-berry.html

Notes and security

- This server uses a JSON file (`data.json`) for storage. It's fine for local testing only. For production use a real database (Postgres, MongoDB, etc.).
- Google OAuth requires you to set up credentials and the redirect URI correctly. After setup, visiting `/auth/google` will start the flow.
- The server scaffold is intentionally minimal. It does not implement authentication middleware or secure sessions. Use it only as a development example.

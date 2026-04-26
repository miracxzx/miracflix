# MIRACFLIX

MIRACFLIX is a Netflix-inspired movie and series discovery app built with `Vite`, `TMDB`, `Supabase`, and `Netlify`.
It combines a cinematic browsing experience with profile-based personalization, comments, ratings, watch progress, friend requests, and list management.

Live site:
[https://miracflix.netlify.app](https://miracflix.netlify.app)

## Overview

MIRACFLIX is designed as a single-page streaming-style interface where users can:

- browse movies and TV shows from TMDB
- open rich detail pages with trailer, cast, directors, and related content
- track watch progress and mark titles as completed
- keep separate profile-based preferences and viewing states
- create personal lists and lightweight shared lists
- rate titles, write comments, and interact socially
- send friend requests and manage notifications through Supabase

The project is optimized for a "real product surface" feel rather than a simple catalog demo.

## Feature Set

### Discovery and browsing

- Hero banner with featured content
- Movie and TV rows with Netflix-style rails
- Themed shelves like mystery TV, 90s movies, IMDb 8+ picks
- Advanced search with:
  - media type
  - year
  - genre
  - topic filters
- Collection overlays for search results, history, favorites, and lists

### Title detail experience

- Large cinematic detail modal
- Play and trailer actions
- Cast links with person pages
- Director / creator links with person pages
- Similar and recommended content
- TV season and episode guide

### Progress and personal state

- Continue watching
- Watch later
- Favorites
- Watch progress percentage
- Last episode tracking for series
- Completed / unwatched state
- Hide content

### Lists

- Create personal custom lists
- Add the current title to a selected list
- Open and manage lists from profile menu
- Remove titles from a list
- Delete lists
- Create lightweight shared lists with selected friends

### Social features

- Comments with spoiler mode
- Like / unlike comment reactions
- Reply helper
- Public comment profile view
- Friend request flow
- Notification dropdown for social events
- Basic friendship-aware social surface

### Profiles and preferences

- Multiple local/user profiles
- Avatar selection
- Theme options
- Language preference
- Home layout preference
- Compact mobile mode
- Reduced backdrop motion

## Tech Stack

- `Vite`
- `Vanilla JavaScript`
- `TMDB API`
- `Supabase Auth + Database`
- `Netlify`

## Project Structure

This project currently uses a simple flat frontend structure rather than a component framework:

- [index.html](C:/Users/mirac/Documents/Projelerim/movie/index.html): app markup, overlays, modal shells
- [main.js](C:/Users/mirac/Documents/Projelerim/movie/main.js): main application logic, rendering, auth, social features
- [style.css](C:/Users/mirac/Documents/Projelerim/movie/style.css): visual system and responsive styling
- [supabase-config.js](C:/Users/mirac/Documents/Projelerim/movie/supabase-config.js): Supabase URL and anon key
- [supabase-friend-system.sql](C:/Users/mirac/Documents/Projelerim/movie/supabase-friend-system.sql): friend requests, notifications, public profile, and friendship SQL setup
- [netlify.toml](C:/Users/mirac/Documents/Projelerim/movie/netlify.toml): production build and SPA redirect config

## Local Development

### 1. Install dependencies

```bash
npm install
```

### 2. Start the dev server

```bash
npm run dev
```

### 3. Build for production

```bash
npm run build
```

### 4. Preview the production build

```bash
npm run preview
```

## Supabase Setup

MIRACFLIX uses Supabase for:

- authentication
- ratings
- comments
- friend requests
- notifications
- user-linked public profile lookup
- persistent user/profile data

### Required tables already expected by the app

- `user_data`
- `comments`
- `ratings`

### Social system tables

To enable the current friend request + notification flow, run:

[supabase-friend-system.sql](C:/Users/mirac/Documents/Projelerim/movie/supabase-friend-system.sql)

This SQL adds:

- `user_public_profiles`
- `friend_requests`
- `friendships`
- `notifications`
- RLS policies
- `accept_friend_request(...)`
- `decline_friend_request(...)`

### Auth redirect configuration

In Supabase dashboard:

`Authentication > URL Configuration`

Set:

- `Site URL`: `https://miracflix.netlify.app`
- `Redirect URLs`:
  - `https://miracflix.netlify.app`
  - `https://miracflix.netlify.app/**`

Without this, confirmation emails may redirect to localhost or fail redirect validation.

## Configuration Notes

Supabase credentials are currently referenced in:

[supabase-config.js](C:/Users/mirac/Documents/Projelerim/movie/supabase-config.js)

For a stronger production setup, moving these values behind environment-based injection would be a good next step, even though the anon key is expected to be public on the client side.

## Deployment

Production deploys are served from Netlify.

The repo includes:

- build command: `npm run build`
- publish directory: `dist`
- SPA fallback redirect via [netlify.toml](C:/Users/mirac/Documents/Projelerim/movie/netlify.toml)

Typical deploy flow:

```bash
git push origin main
npx netlify deploy --prod --build
```

## Product Behavior Notes

- Watch state is profile-aware inside the current user record.
- Public user profiles are intentionally partial; some sections depend on Supabase RLS and optional tables.
- Shared lists are currently lightweight and stored in user profile data rather than a full multi-user collaborative table model.
- Friend requests and notifications depend on the SQL setup being applied in Supabase.

## Roadmap Ideas

- Fully synchronized multi-user shared lists
- Public/private list visibility controls
- Rich user profile pages
- Better collaborative activity feed
- Stronger notification center with read states and filters
- Search improvements powered by richer metadata
- Admin/content moderation helpers for comments

## Why This Project Feels Different

MIRACFLIX is not just a TMDB browser.
It aims to sit somewhere between:

- a streaming-style content explorer
- a personal media tracker
- a lightweight social entertainment app

The app is intentionally opinionated about presentation, interaction density, and personalization.

## Credits

- Content metadata: TMDB
- Auth and database: Supabase
- Hosting: Netlify

## License

No license file is currently included in this repository.
If this repo is intended for public reuse, adding a license is recommended.

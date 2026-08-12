# Architecture — Paadal Pettagam

## Overview

A single-file React application. All state lives in one component tree, persistence is a single JSON blob in key-value storage, and the only external service is the Anthropic API, used for one job: transliterating original-script song names into Latin letters.

```
┌───────────────────────────────────────────────┐
│              CarnaticSongTracker              │
│  (single React component, default export)     │
│                                               │
│  Header · Stats · Controls (search / add)     │
│  Add-Edit Panel · Duplicate Dialog            │
│  Song List → Song Card → Expanded Detail      │
│  Toast · Footer                               │
└───────────┬──────────────────────┬────────────┘
            │                      │
   window.storage           Anthropic API
   (persistent KV,          (transliteration
    one JSON blob)           via Claude)
```

## State

| State | Purpose |
|---|---|
| `songs` | The full collection, source of truth, mirrored to storage on every mutation |
| `search` | Live filter text |
| `panel`, `form`, `editingId` | Add/edit panel mode and its field values |
| `expandedId` | Which song card is open |
| `dupMatches`, `pendingSong` | Duplicate-alert dialog: the matches found and the song waiting for a decision |
| `busy`, `toast`, `loading` | Async/UI feedback |

Derived values (`useMemo`): unique guru / composer / raga lists (feed the autocomplete datalists and stats), and the filtered song list.

## Storage layer

- One key: `carnatic-songs-v1` → `JSON.stringify(songs)`.
- A single blob keeps writes atomic and avoids sequential per-song calls.
- `loadSongs()` treats a missing key as an empty collection (first run).
- Every mutation goes through `commit(next)`: set state, then persist; a failed persist surfaces a toast but never loses in-memory state.

## Transliteration service

`aiTransliterate(text)` sends the original-script name to Claude with a strict instruction: transliterate the *sounds* into conventional Carnatic romanization, do **not** translate the meaning, return minified JSON only (`{transliteration, language}`). The response is fence-stripped and parsed. It is called only when the name contains non-Latin characters **and** the user left the transliteration field blank — a manually typed transliteration always wins. Failure is non-fatal: the song saves anyway and the field can be edited later.

## Duplicate detection

`normalize()` lowercases, strips diacritics (NFD decomposition), and removes punctuation/whitespace, keeping Latin alphanumerics and Indic script ranges. A candidate is a "hit" against an existing song when any normalized key (name or transliteration) exactly matches, or when one contains the other (both ≥ 6 chars, to avoid false positives on short names). Matches are shown in a blocking dialog; the user decides.

## Sequence diagrams

### Add a song (with transliteration and duplicate check)

```mermaid
sequenceDiagram
    actor U as User
    participant UI as App UI
    participant T as Claude API
    participant S as window.storage

    U->>UI: Type song name (Tamil script), tap "Save song"
    UI->>UI: Validate: name is required
    alt Name is non-Latin and transliteration blank
        UI->>T: POST /v1/messages (transliterate, JSON-only)
        T-->>UI: {transliteration, language}
    else Manual transliteration provided
        UI->>UI: Use the typed value
    end
    UI->>UI: normalize(name, transliteration)
    UI->>UI: Compare against every existing song
    alt Likely duplicate found
        UI-->>U: Alert dialog listing matching songs
        alt User taps "Don't add"
            U->>UI: Cancel
            UI->>UI: Discard pending song
        else User taps "Add anyway"
            U->>UI: Confirm
            UI->>S: set("carnatic-songs-v1", full JSON)
            S-->>UI: ok
            UI-->>U: Toast: "Added — song #N in the book."
        end
    else No duplicate
        UI->>S: set("carnatic-songs-v1", full JSON)
        S-->>UI: ok
        UI-->>U: Toast: "Added — song #N in the book."
    end
```

### App start (load the notebook)

```mermaid
sequenceDiagram
    actor U as User
    participant UI as App UI
    participant S as window.storage

    U->>UI: Open the app
    UI->>S: get("carnatic-songs-v1")
    alt Key exists
        S-->>UI: JSON blob
        UI->>UI: parse → songs[]
    else First run (key missing)
        S-->>UI: error / null
        UI->>UI: songs = []
    end
    UI-->>U: Numbered list (or empty-state invitation)
```

### Open lyrics and play audio

```mermaid
sequenceDiagram
    actor U as User
    participant UI as App UI
    participant W as Browser / PDF viewer
    participant H as Audio host

    U->>UI: Tap a song card
    UI-->>U: Expanded detail (facts, player, actions)
    opt Lyrics linked
        U->>UI: Tap "View lyrics (PDF)"
        UI->>W: Open lyricsUrl in new tab
        W-->>U: PDF rendered
    end
    opt Audio linked
        U->>UI: Tap play on the audio element
        UI->>H: Stream audioUrl
        H-->>U: Playback with native controls
    end
```

### Edit — filling in fields later

```mermaid
sequenceDiagram
    actor U as User
    participant UI as App UI
    participant S as window.storage

    U->>UI: Expand song → "Edit / fill in details"
    UI-->>U: Panel pre-filled with existing values
    U->>UI: Add composer / raga / guru / links, tap "Save changes"
    UI->>UI: Replace song in songs[] (id match, dateAdded kept)
    UI->>S: set("carnatic-songs-v1", full JSON)
    S-->>UI: ok
    UI-->>U: Toast: "Song updated."
```

## Cross-platform strategy

One responsive web codebase rather than separate native builds. It runs in any modern browser on Android, iOS, and desktop; inside Claude it runs as an artifact with account-backed storage; hosted standalone it can be added to the home screen on both mobile platforms (see README). Layout breakpoints collapse the two-column form to one column under 540 px, cards wrap gracefully, and reduced-motion preferences are respected.

## Design system

| Token | Value | Role |
|---|---|---|
| Paper | `#F6EEDC` | Background — sandal manuscript |
| Ink | `#4A1416` | Text / primary — kanjivaram maroon |
| Peacock | `#16606B` | Secondary, labels, transliterations |
| Turmeric | `#C1922F` | Number medallions, accents |
| Kumkum | `#B3402A` | Counts, warnings |

Display type: Iowan Old Style / Palatino serif stack. Signature element: the four-string tambura divider under the title and the gold song-number medallions. Original script is always the largest text on each card, with the transliteration set beneath it in peacock.

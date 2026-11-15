# Lauchgrün Partner-API: Turnier-Blacklist

Mit dieser API könnt ihr die Spieler abrufen, die bei Lauchgrün-Turnieren gesperrt sind, und uns Spieler melden, die bei euren Turnieren negativ aufgefallen sind.

- **Abrufen:** Ihr seht alle Sperren, die wir für Partner freigegeben haben.
- **Melden:** Eure Meldungen landen bei uns zur Prüfung. Gesperrt wird erst, wenn wir die Meldung annehmen.

---

## Schnellstart

```bash
curl https://tournament.lauchgruen.de/api/v1/blacklist \
  -H "Authorization: Bearer lgk_EUER_KEY"
```

## Grundlagen

| | |
|---|---|
| **Basis-URL** | `https://tournament.lauchgruen.de/api/v1` |
| **Format** | JSON (UTF-8), Requests mit `Content-Type: application/json` |
| **Auth** | `Authorization: Bearer <API-Key>` bei jedem Request |
| **Rate Limit** | 60 Requests pro Minute pro Key |
| **Offene Meldungen** | etwa 50 gleichzeitig pro Key |

**Wichtig:** Nutzt immer `tournament.lauchgruen.de`. Andere Domains von uns leiten API-Aufrufe nicht weiter.

### Euer API-Key

- Ihr bekommt euren Key privat von uns. Er beginnt mit `lgk_`.
- Behandelt ihn wie ein Passwort. Ruft die API nur von eurem Server oder Bot aus auf. Baut den Key nie in eine Webseite, ein Browser-Script oder ein öffentliches Repository ein.
- Wenn der Key bekannt geworden ist, meldet euch bei uns. Wir sperren ihn und stellen euch einen neuen aus.

---

## Endpunkte

### 1. Blacklist abrufen

`GET /blacklist`

Liefert die **vollständige, aktuelle Liste** aller für Partner freigegebenen Sperren.

```bash
curl https://tournament.lauchgruen.de/api/v1/blacklist \
  -H "Authorization: Bearer lgk_EUER_KEY"
```

**Antwort `200`**

```json
{
  "entries": [
    {
      "riotId": "beispiel#euw",
      "discordId": "123456789012345678",
      "reason": "Unsportliches Verhalten",
      "since": "2026-11-15T18:30:00.000Z"
    }
  ],
  "count": 1,
  "generatedAt": "2026-11-16T10:00:00.000Z"
}
```

| Feld | Typ | Beschreibung |
|---|---|---|
| `riotId` | string \| null | Riot-ID in Kleinbuchstaben (`name#tag`) |
| `discordId` | string \| null | Discord-User-ID |
| `reason` | string | Kurzer öffentlicher Grund |
| `since` | string | Zeitpunkt der Sperre (ISO 8601, UTC) |

Mindestens eines der Felder `riotId` und `discordId` ist immer gesetzt.

> **Synchronisieren:** Ersetzt eure lokale Kopie bei jedem Abruf komplett, statt nur neue Einträge anzuhängen. Nur so verschwinden aufgehobene Sperren auch bei euch. Ein Abruf pro Stunde oder vor jeder Anmeldephase reicht.

### 2. Einzelnen Spieler prüfen

`GET /blacklist/check?riotId=<Name#TAG>` oder `?discordId=<ID>`

Praktisch für eine Prüfung direkt bei der Anmeldung. Ihr könnt auch beide Parameter angeben. Es reicht dann, wenn einer davon passt.

```bash
curl "https://tournament.lauchgruen.de/api/v1/blacklist/check?riotId=Beispiel%23EUW" \
  -H "Authorization: Bearer lgk_EUER_KEY"
```

Das `#` in der Riot-ID muss in der URL als `%23` geschrieben werden. Groß- und Kleinschreibung ist egal.

**Antwort `200`**

```json
{
  "banned": true,
  "entry": {
    "riotId": "beispiel#euw",
    "discordId": null,
    "reason": "Unsportliches Verhalten",
    "since": "2026-11-15T18:30:00.000Z"
  }
}
```

Ist der Spieler nicht gesperrt, kommt `{ "banned": false, "entry": null }`.

### 3. Spieler melden

`POST /blacklist/reports`

Schlägt uns einen Spieler zur Sperre vor. Die Meldung hat danach den Status `pending`, bis wir sie geprüft haben.

```bash
curl -X POST https://tournament.lauchgruen.de/api/v1/blacklist/reports \
  -H "Authorization: Bearer lgk_EUER_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "riotId": "Beispiel#EUW",
    "discordId": "123456789012345678",
    "reason": "Zweimal nicht zum Match erschienen und Gegner im Chat beleidigt.",
    "evidenceUrl": "https://example.com/screenshot.png"
  }'
```

| Feld | Pflicht | Regeln |
|---|---|---|
| `riotId` | eins von beiden | Format `Name#TAG` |
| `discordId` | eins von beiden | Discord-User-ID, 17 bis 20 Ziffern |
| `reason` | ja | 10 bis 1000 Zeichen, sachlich und konkret |
| `evidenceUrl` | nein | Link zu Screenshot, Clip oder Replay |

Andere Felder werden abgelehnt.

**Antwort `202`** (neue Meldung)

```json
{
  "report": {
    "id": "8f1c2a4e-5b6d-4c3a-9e2f-1a2b3c4d5e6f",
    "discordId": "123456789012345678",
    "riotId": "beispiel#euw",
    "reason": "Zweimal nicht zum Match erschienen und Gegner im Chat beleidigt.",
    "evidenceUrl": "https://example.com/screenshot.png",
    "status": "pending",
    "createdAt": "2026-11-16T10:05:00.000Z",
    "reviewedAt": null
  },
  "duplicate": false
}
```

Habt ihr denselben Spieler schon gemeldet und die Meldung ist noch offen, kommt `200` mit `"duplicate": true` und der bestehenden Meldung. Es wird keine zweite angelegt.

### 4. Eigene Meldungen ansehen

`GET /blacklist/reports` liefert alle eure Meldungen, die neuesten zuerst (maximal 200).

`GET /blacklist/reports/{id}` liefert eine einzelne Meldung.

```bash
curl https://tournament.lauchgruen.de/api/v1/blacklist/reports \
  -H "Authorization: Bearer lgk_EUER_KEY"
```

| Status | Bedeutung |
|---|---|
| `pending` | Wartet auf unsere Prüfung |
| `accepted` | Angenommen, der Spieler ist bei uns gesperrt |
| `rejected` | Abgelehnt |
| `withdrawn` | Von euch zurückgezogen |

Ihr seht nur eure eigenen Meldungen.

### 5. Meldung zurückziehen

`DELETE /blacklist/reports/{id}`

Funktioniert nur, solange die Meldung `pending` ist.

```bash
curl -X DELETE https://tournament.lauchgruen.de/api/v1/blacklist/reports/8f1c2a4e-5b6d-4c3a-9e2f-1a2b3c4d5e6f \
  -H "Authorization: Bearer lgk_EUER_KEY"
```

Antwort `200` mit der Meldung im Status `withdrawn`. Ist sie schon bearbeitet, kommt `409`.

---

## Fehler

Alle Fehler haben dieselbe Form:

```json
{ "error": { "code": "invalid_request", "message": "riotId muss das Format Name#TAG haben." } }
```

| HTTP | `code` | Bedeutung |
|---|---|---|
| 400 | `invalid_json` | Body ist kein gültiges JSON |
| 400 | `invalid_request` | Feld fehlt oder hat ein falsches Format (Details in `message`) |
| 401 | `unauthorized` | Key fehlt, ist falsch oder wurde gesperrt |
| 404 | `not_found` | Meldung existiert nicht oder gehört nicht zu eurem Key |
| 409 | `already_reviewed` | Meldung ist schon bearbeitet oder zurückgezogen |
| 429 | `rate_limited` | Mehr als 60 Requests pro Minute. Wartet so viele Sekunden, wie der Header `Retry-After` angibt |
| 429 | `too_many_pending` | 50 offene Meldungen erreicht. Wartet, bis wir geprüft haben |
| 5xx | – | Fehler bei uns. Versucht es später erneut |

---

## Beispiel: Prüfung bei der Anmeldung (Node.js)

```js
const API = "https://tournament.lauchgruen.de/api/v1";
const KEY = process.env.LAUCHGRUEN_API_KEY; // nie im Code speichern

async function isBanned({ riotId, discordId }) {
  const params = new URLSearchParams();
  if (riotId) params.set("riotId", riotId);
  if (discordId) params.set("discordId", discordId);

  const response = await fetch(`${API}/blacklist/check?${params}`, {
    headers: { Authorization: `Bearer ${KEY}` },
  });
  if (!response.ok) throw new Error(`Lauchgrün API: ${response.status}`);
  const { banned, entry } = await response.json();
  return banned ? entry : null;
}

const ban = await isBanned({ riotId: "Beispiel#EUW" });
if (ban) console.log(`Gesperrt seit ${ban.since}: ${ban.reason}`);
```

---

## Regeln für die Nutzung

1. **Nur für Turnier-Zulassung.** Nutzt die Daten nur, um zu prüfen, ob jemand an eurem Turnier teilnehmen darf.
2. **Nicht veröffentlichen.** Postet die Liste nicht öffentlich und gebt sie nicht an Dritte weiter.
3. **Aktuell halten.** Synchronisiert regelmäßig und löscht Einträge, die nicht mehr in der Liste stehen.
4. **Fair melden.** Meldet nur mit konkretem Grund und möglichst mit Beleg. Wir prüfen jede Meldung selbst und können nachfragen.
5. **Bei Rückfragen von Spielern** (z. B. zu einer Sperre) verweist sie bitte an uns.

Wir können einen Key jederzeit sperren, wenn diese Regeln nicht eingehalten werden.

## Kontakt

Fragen, neuer Key oder Probleme: Meldet euch bei uns auf Discord.

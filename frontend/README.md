# Local interface preview

Build the panel, then start its standalone preview:

```sh
npm run build
npm run preview
```

Open [the French dark preview](http://127.0.0.1:8766/?lang=fr&theme=dark).
The server binds only to `127.0.0.1`, serves an explicit list of preview files,
and makes no Home Assistant connection. Every room, entity and resident is
fictional. Saving, validation and manual actions use an in-memory UI mock;
this does **not** simulate or validate the Python presence engine. Reloading
restores the original demonstration configuration and clears its local draft.

Query parameters make screenshots reproducible:

| Parameter | Values |
| --- | --- |
| `lang` | `en` (default), `fr` |
| `theme` | `dark` (default), `light` |
| `room` | `office`, `garden`, `living_room`, `kitchen`, `bedroom`, `bathroom`, `hallway`, `laundry`, `garage` |
| `tab` | `presence`, `detection`, `timing`, `context`, `settings` |
| `view` | `rooms`, `residents`, `home` |
| `resident` | `alex`, `camille` |

For example:

- [Office presence, English](http://127.0.0.1:8766/?lang=en&theme=dark&room=office&tab=presence)
- [Garden recovery options, French](http://127.0.0.1:8766/?lang=fr&theme=dark&room=garden&tab=timing)
- [Residents, light theme](http://127.0.0.1:8766/?lang=en&theme=light&view=residents)

Use a narrow browser viewport to exercise the mobile layout. The preview
supplies Home Assistant theme variables and a small local `ha-icon` stand-in;
icons and fonts can differ slightly from a real Home Assistant installation.
Wait for `document.documentElement.dataset.previewReady === "true"` before
capturing. Rebuild and reload after editing the panel sources. Use
`npm run preview -- --port=8767` or `HAPO_PREVIEW_PORT=8767 npm run preview` to
choose another port. Stop the server with Ctrl+C.

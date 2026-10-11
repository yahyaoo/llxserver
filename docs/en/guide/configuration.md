# 洛洛雪音乐 Architecture and Configuration Guide

洛洛雪音乐 adheres to the design principle of **zero configuration and out-of-the-box use**, while providing a highly flexible **multi-level configuration injection engine and environment variable reading mechanism** to meet the needs of advanced deployment scenarios. When the Node.js backend service process starts, the system will follow strict hierarchical rules to merge and rewrite various configuration items.

## Configuration Loading Hierarchy and Execution Priority

洛洛雪音乐 has built a unified basic model skeleton (located in `server/defaultConfig.ts`). During the initialization of the service instance, the configuration parser will streamingly distribute parameters to the **service-side underlying environment** (such as network binding, WebDAV settings, etc.) and the **front-end running environment** (injected into the browser execution sandbox `/js/config.js`) respectively.

Business configuration is stored in the admin SQLite database. Startup loads stored values over defaults from `server/defaultConfig.ts`, then applies the existing environment variable overrides and persists the effective configuration. WebDAV restore writes business documents back to SQL and reloads them.

`config.js` contains `server.database.adminPath`, `server.database.musicPath` and `client.xxx` connection settings. `CONFIG_PATH` selects this bootstrap file. Database paths are relative to `DATA_PATH` unless absolute. Editing old business fields in this file no longer changes configuration; explicitly upload a static old configuration through System Config → Database and Migration. See the [deployment configuration](https://github.com/yahyaoo/llxserver/blob/dev/deploy/README.md) for the environment variable overrides.

The admin settings page groups service/access, music/cache, and synchronization/data controls. Database relocation copies committed records, verifies the candidate databases, switches connections, and saves bootstrap paths; preparation failure keeps the old databases. Existing target files are rejected. See the [system configuration guide](../../system-configuration.md) for migration details.

---

## Core Configuration Parameter Dictionary

The following list an array of environment variable (ENV) parameters that affect critical service behaviors:

### I. Network Communication and Underlying Service Configuration

This module manages the Node.js listening process and the basic settings of the network stack.

| Environment Variable Mapping Key (ENV) | System Default Value | Data Type | Scope and Applicable Scenarios |
| :-------------------- | :------------ | :------- | :-------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PORT` | `9527` | Integer | **Service listening port**. It is recommended to avoid using other high-frequency ports in the host (such as 80, 443, 3306). |
| `BIND_IP` | `0.0.0.0` | String | The current main HTTP listener remains fixed at `0.0.0.0`; changing this value does not change the listener. |
| `ADMIN_PATH` | `'/admin'` | String | **Backend management interface path**. Default is `/admin`. |
| `PLAYER_PATH` | `'/'` | String | **Web player access path**. Default is the root path `/`. |
| `SERVER_NAME` | `lxserver` | String | **Sync service name**. Showed in client connections. |
| `PROXY_HEADER` | `x-real-ip` | String | **Reverse proxy remote IP penetration identifier**. When the system runs behind reverse proxies or load balancers such as Nginx, it is used to extract the true client source IP address to ensure accurate traceability of equipment audit logs. |
| `PROXY_ALL_ENABLED` | `false` | Boolean | **Enable global outgoing request proxy**. If enabled, network requests from the server (e.g. search, resolving) will go through the proxy. |
| `PROXY_ALL_ADDRESS` | `''` | String | **Proxy address**. Supports `http://` or `socks5://`, e.g. `socks5://127.0.0.1:10808`. |
| `DISABLE_TELEMETRY` | `false` | Boolean | **System telemetry feedback circuit breaker**. Set to `true` will completely block anonymous state probe packets between the system and external nodes, and disable all system-level new version updates or announcement distributions. |

> 💡 **Boolean Environment Variable Format Note**:
> All boolean environment variables support flexible case-insensitive formats:
> - **Enabled (True)**: `true` / `1` / `yes` / `y` / `on`
> - **Disabled (False)**: `false` / `0` / `no` / `n` / `off`

### II. Persistence and Account Sandbox Management Strategy

This module involves monitoring the status of connected clients and isolation specifications at the physical storage level.

| Environment Variable Mapping Key (ENV) | System Default Value | Data Type | Scope and Applicable Scenarios |
| :-------------------- | :--------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `FRONTEND_PASSWORD` | `123456` | String | **Control Panel Admin Password**. Used to log into the management console (default `/admin`). Recommended to modify immediately on setup. |
| `MAX_SNAPSHOT_NUM` | `10` | Integer | **Time snapshot retention threshold setting**. The maximum allowed length of the historical archive snapshot queue retained by the system. Early histories exceeding this queue limit will be cyclically discarded by the underlying timed GC task. |
| `DATA_PATH` | `./data` | String | **Data directory path**. Specifies where persistence data (SQLite databases, music cache and compatibility exports) are stored. |
| `LOG_PATH` | `./logs` | String | **Log directory path**. Specifies where system logs are stored. |
| `CONFIG_PATH` | `''` | String | **Bootstrap file path**. Server SQLite paths and client connection settings. CLIENT_CONFIG_PATH can select a separate client file. |
| `USER_ENABLE_PATH` | `true` | Boolean | **Enable User Path Mode (Recommended)**. When enabled, client sync URL is `http://ip:port/<username>`, and data is isolated per user. **Allows multiple users to use identical passwords**. |
| `USER_ENABLE_ROOT` | `false` | Boolean | **Enable Root Path Mode**. When enabled, client sync URL is `http://ip:port` (without username), and server auto-matches user by password. **Requires all user passwords to be unique**. |
| `ENABLE_PUBLIC_USER_RESTRICTION` | `true` | Boolean | **Restrict public user permissions**. If enabled, non-admin public users will be restricted from sensitive operations like uploading source, deleting public sources, caching to server, etc. |
| `ENABLE_PUBLIC_NON_ADMIN_LOCAL_MUSIC` | `false` | Boolean | **Enable non-admin access to local music**. If enabled, allows non-admin public accounts to access local music. |
| `ENABLE_PUBLIC_NON_ADMIN_BROWSER_DOWNLOAD` | `true` | Boolean | **Enable non-admin browser download**. If enabled, allows non-admin/public accounts to download songs via browser. |
| `ENABLE_PUBLIC_NON_ADMIN_SERVER_CACHE` | `false` | Boolean | **Enable non-admin server cache**. If enabled, allows non-admin/public accounts to cache or save songs to server. |
| `ENABLE_LOGIN_USER_CACHE_RESTRICTION` | `false` | Boolean | **Restrict cache settings for logged-in users**. If enabled, non-admin logged-in users will be restricted from modifying core cache settings. |
| `ENABLE_CACHE_SIZE_LIMIT` | `false` | Boolean | **Enable automatic cache cleanup**. If enabled, the system will monitor and limit the total user cache size, and automatically delete oldest files (LRU) when the limit is reached. |
| `CACHE_SIZE_LIMIT` | `2000` | Integer | **Cache size limit (MB)**. The threshold at which the auto-cleanup mechanism is triggered. |

### III. WebDAV Configuration

The underlying periodic polling asynchronous daemon of the service will only be fully awakened if the following environment variable group is authorized (especially the `WEBDAV_URL` link effectively takes effect):

| Environment Variable Mapping Key (ENV) | System Default Value | Data Type | Scope and Applicable Scenarios |
| :------------------- | :--------- | :------- | :------------------------------------------------------------------------------------------------------------- |
| `WEBDAV_URL` | `''` | String | Various complete URIs with standard WebDAV protocol gateway interfaces (including HTTPS declaration), for example: `https://dav.jianguoyun.com/dav/Sync`. |
| `WEBDAV_USERNAME` | `''` | String | Authorization identification name used for WebDAV service node handshake authentication. |
| `WEBDAV_PASSWORD` | `''` | String | Remote WebDAV gateway access key (highly recommended to use an independent application-specific authorization password to reduce secondary leakage risks). |
| `SYNC_INTERVAL` | `60` | Integer | Cold shrinking timed parameters (unit: minutes) that trigger full thermal backup and pull comparison synchronization flow periods. |

> 🔖 **Stateful Resurrection and Initialization Mechanism**:
> 1. **Cloud-First Restoration**: If this set of variables is detected at startup, the system will prioritize attempting to pull archives from the cloud.
> 2. **Environment-Driven Persistence**: If the cloud config is empty (e.g., first deployment in Docker/Cloud), the system will **automatically persist effective business configuration to SQLite and upload its exported business document to the cloud** for initialization. This ensures you can establish the initial cloud data solely through environment variables.

### IV. Web-side Composite Media Playback Space Protection Logic

| Environment Variable Mapping Key (ENV) | System Default Value | Data Type | Scope and Applicable Scenarios |
| :------------------------ | :--------- | :------- | :------------------------------------------------------------------------------------------------------------------ |
| `ENABLE_WEBPLAYER_AUTH` | `false` | Boolean | Whether to establish a separate entry-blocking defense wall for the derived browser access interface (rendered under default root path `/`) and refuse direct face-to-face from visitors. |
| `WEBPLAYER_PASSWORD` | `123456` | String | If the upper-level authentication mode takes effect, it is the separate password dictionary for verification. This gives administrators the ability to decouple keys for different levels of the audience layer and the backend control panel. |

### V. Playlist Management Strategy

| Environment Variable Mapping Key (ENV) | System Default Value | Data Type | Scope and Applicable Scenarios |
| :--- | :--- | :--- | :--- |
| `LIST_ADD_MUSIC_LOCATION_TYPE` | `top` | String | **New song location**. `top` (add to the top) or `bottom` (add to the bottom). |

### VII. Subsonic Protocol Configuration

| Environment Variable Mapping Key (ENV) | System Default Value | Data Type | Scope and Applicable Scenarios |
| :--- | :--- | :--- | :--- |
| `SUBSONIC_ENABLE` | `true` | Boolean | **Enable Subsonic protocol**. Allows connections from Subsonic-compatible clients. |
| `SUBSONIC_PATH` | `'/rest'` | String | **Subsonic access path**. Default is `/rest`. |
| `SUBSONIC_ENABLE_DEBUG` | `false` | Boolean | **Enable Subsonic debug log mode**. Default is `false`. |
| `SUBSONIC_ONLINE_SEARCH` | `true` | Boolean | **Enable Subsonic online search**. Supports searching and streaming external online tracks in Subsonic clients. |
| `SUBSONIC_ONLINE_SEARCH_MODE` | `'fallback'` | String | **Subsonic online search mode**. `fallback`, `merge`, or `local_only`. |
| `SUBSONIC_ONLINE_SEARCH_SOURCES` | `'wy,tx,kw,kg,mg'` | String | **Subsonic default online search sources**. Comma-separated platform codes. |
| `SUBSONIC_LYRIC_TRANSLATION` | `true` | Boolean | **Include translations in Subsonic lyrics**. |

### VIII. Business Feature Extension Configuration

| Environment Variable Mapping Key (ENV) | System Default Value | Data Type | Scope and Applicable Scenarios |
| :--- | :--- | :--- | :--- |
| `SINGER_SOURCE_PRIORITY` | `'tx,wy'` | String | **Singer source priority**. Controls the priority order for fetching singer details, photos, and Mid. Available values are `tx` (Tencent) and `wy` (Netease), separated by commas. |
| `ARTIST_MAX_FETCH_PAGES` | `20` | Integer | **Maximum fetch pages for artist tracks**. Upper limit when fetching full song lists for artists. |
| `CACHE_NAMING_PATTERN` | `'simple'` | String | Cache naming: `simple`, `standard`, `singer_name_quality_album`, `singer_name`, `name_singer`. Saved player naming settings take precedence. |
| `SYSTEM_ALLOW_UNSAFE_VM` | `false` | Boolean | **Allow unsafe VM custom source scripts**. If enabled, allows running custom source scripts requiring VM sandbox features (use with caution). |

### IX. (Advanced Feature) Silent Preset Accounts in CLI Environment

With the pre-declaration strategy at the operating system level, users can statically write accounts into the data persistence layer within the server initialization startup sequence without skipping graphical interface configuration:

Based on the prefix regex extraction mechanism: Adopt the naming rule of `LX_USER_<target signature string>=<password string>` to write into environment variables to achieve authorized interception and building file execution.

#### Example of environment variable dispatch startup:

```bash
# Execute this system declaration, and the accompanying script task will land these three entity records into the data system for authorized issuance.
export LX_USER_foo="mypassword123"
export LX_USER_bar="mypassword321"
export LX_USER_hello="12345"
npm run start
```

*(Note: After the successful accompanying system control operation mentioned above, this memory object will be converted into entity data and permanently archived to the mounted `管理 SQLite 数据库` file for continuous function verification.)*

---

When using Docker environments to orchestrate services, it is recommended that you directly convert the contents of this configuration file mapping manual into an `environment` array in `docker-compose.yml`, or append `-e [KEY]=[VALUE]` to the container parameter adjustment command to achieve system feature definitions and smooth startup.

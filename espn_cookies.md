# How to Retrieve ESPN Private League Cookies (`SWID` & `espn_s2`)

To synchronize private ESPN fantasy leagues with **FantasyDrafter**, ESPN requires two authentication cookies: **`SWID`** and **`espn_s2`**.

> [!NOTE]
> If your ESPN fantasy league is **Public**, you do not need to provide cookies—only **Private** leagues require `SWID` and `espn_s2`.

---

## What Are These Cookies?

| Cookie Name | Description | Example Format |
| :--- | :--- | :--- |
| **`SWID`** | Unique Software Identification GUID for your ESPN/Disney account. Permanent and does not expire. | `{12345678-ABCD-1234-ABCD-1234567890AB}` |
| **`espn_s2`** | Long authentication token (~200+ characters). Valid for approximately 1 year or until you explicitly log out of ESPN. | `AEC...long_string_of_characters...==` |

---

## Step-by-Step Instructions

### Step 1: Log in to ESPN
1. Open your desktop web browser (Chrome, Edge, Firefox, Brave, or Safari).
2. Go to [fantasy.espn.com](https://fantasy.espn.com) (or [espn.com](https://www.espn.com)).
3. Make sure you are **logged in** to the ESPN account that participates in the private fantasy league.

### Step 2: Open Browser Developer Tools
* **Windows / Linux**: Press <kbd>F12</kbd> or <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>I</kbd>.
* **macOS**: Press <kbd>Cmd</kbd> + <kbd>Option</kbd> + <kbd>I</kbd>.
* *Alternative*: Right-click anywhere on the webpage and select **Inspect**.

### Step 3: Navigate to the Cookies Storage Panel

* **Google Chrome / Microsoft Edge / Brave**:
  1. Click the **Application** tab in the top navigation bar of DevTools. *(If hidden due to window width, click the `>>` icon).*
  2. In the left sidebar, expand the **Storage** section ➔ **Cookies**.
  3. Click `https://fantasy.espn.com` (or `https://www.espn.com`).

* **Mozilla Firefox**:
  1. Click the **Storage** tab in the DevTools bar.
  2. In the left sidebar, expand **Cookies**.
  3. Click `https://fantasy.espn.com`.

* **Apple Safari**:
  1. Go to the **Storage** tab ➔ **Cookies** ➔ `espn.com`.
  *(Note: If the Develop menu is not visible in Safari, enable it in **Safari Preferences > Advanced > Show Develop menu in menu bar**).*

### Step 4: Search and Copy the Cookie Values

Use the filter/search box located above the cookie table:

1. **Find `SWID`**:
   * Type `SWID` in the filter box.
   * Double-click the entry in the **Value** column and copy it.
   * Be sure to copy the entire string including the curly brackets:
     ```text
     {12345678-ABCD-1234-ABCD-1234567890AB}
     ```

2. **Find `espn_s2`**:
   * Type `espn_s2` in the filter box.
   * Double-click the entry in the **Value** column and copy it.
   * The value is a long string usually starting with `AE...`:
     ```text
     AEC...[approx. 200+ characters]...==
     ```

---

## Step 5: Enter into FantasyDrafter

1. In FantasyDrafter, click the **⚙️ League Setup** button (available in the draft header, in-season subheader, or on any league card).
2. Under the **In-Season Manager & Platform Connection** section:
   * **Platform Provider**: Select `ESPN Fantasy`.
   * **Platform League ID**: Enter your ESPN League ID (found in your browser address bar when viewing your league, e.g. `leagueId=12345678`).
   * **SWID**: Paste your `{...}` string.
   * **espn_s2**: Paste your long token string.
3. Click **Save Changes**.

---

## Troubleshooting & Tips

> [!TIP]
> **Session Persistence**: Closing your browser tab or window does **not** invalidate your `espn_s2` cookie. However, if you explicitly click **Log Out** on ESPN.com, ESPN will revoke that `espn_s2` token, and you will need to re-copy the newly issued cookie.

* **Where is my League ID?** Look at your browser URL when viewing your team or matchup on ESPN. It looks like:
  ```
  https://fantasy.espn.com/football/league?leagueId=12345678
  ```
  The number after `leagueId=` is your **Platform League ID**.
* **Do I need these cookies for public leagues?** No. Public ESPN leagues do not require authentication cookies.

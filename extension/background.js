// Sends whatever you right-clicked to the Stash app running on this Mac.
const ENDPOINT = "http://127.0.0.1:47123/capture";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: "image", title: "Save image to Stash", contexts: ["image"] });
  chrome.contextMenus.create({ id: "selection", title: "Save “%s” to Stash", contexts: ["selection"] });
  chrome.contextMenus.create({ id: "link", title: "Save link to Stash", contexts: ["link"] });
  chrome.contextMenus.create({ id: "page", title: "Save this page to Stash", contexts: ["page"] });
});

async function send(payload) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
  } catch (e) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon.png",
      title: "Stash isn't running",
      message: "Open the Stash app, then try again.",
    });
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  send({
    kind: info.menuItemId,
    srcUrl: info.menuItemId === "image" ? info.srcUrl : undefined,
    selection: info.menuItemId === "selection" ? info.selectionText : undefined,
    linkUrl: info.menuItemId === "link" ? info.linkUrl : undefined,
    pageUrl: info.pageUrl || tab?.url,
    pageTitle: tab?.title,
  });
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "save-page") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) send({ kind: "page", pageUrl: tab.url, pageTitle: tab.title });
});

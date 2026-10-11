// 連不上網路時的錯誤訊息：各家瀏覽器不一樣
// Chrome「Failed to fetch」、iPhone Safari「Load failed」「The network connection was lost」「The Internet connection appears to be offline」「The request timed out」、Firefox「NetworkError when attempting to fetch resource」
export const NETWORK_RE = /fetch|load failed|network|internet connection|connection was lost|timed out|offline/i;

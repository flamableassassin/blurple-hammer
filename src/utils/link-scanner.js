const fetch = require("node-fetch"), config = require("../../config.json"), getRedirects = require("./link-redirects.js")

module.exports = (rawLinks, constants, redirects = null) => new Promise(async resolve => {
  if (!redirects) redirects = await Promise.all(rawLinks.map(getRedirects));
  console.log(redirects)
  
  const links = redirects.filter(constants.onlyUnique), allLinks = flat(links).map(link => link.match(constants.linkDomainRegex)[0]).filter(constants.onlyUnique)
  const wotData = await fetch(`https://api.mywot.com/0.4/public_link_json2?hosts=${allLinks.map(l => l + "/").join("")}&key=${config.wot}`).then(res => res.json()).catch(() => ({}))
  const googleData = await fetch(`https://safebrowsing.googleapis.com/v4/threatMatches:find?key=${config.google}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client: {
        clientId: "Blurple Hammer",
        clientVersion: "2.0.1"
      },
      threatInfo: {
        threatTypes: [
          "MALWARE",
          "UNWANTED_SOFTWARE",
          "POTENTIALLY_HARMFUL_APPLICATION"
        ],
        platformTypes: [ "ANY_PLATFORM" ],
        threatEntryTypes: [ "URL" ],
        threatEntries: redirects.map(url => ({ url }))
      }
    })
  }).then(res => res.json()).then(({ matches = [] }) => matches.map(match => ({
    url: match.threat.url,
    type: match.threatType
  })))

  console.log(googleData)

  return resolve(flat(links.map(redirects => redirects.map((link, rNum) => {
    const domain = link.match(constants.linkDomainRegex)[0]
    let result = {
      url: link, domain,
      origin: rNum ? redirects[rNum - 1] : null,
      safe: true,

      whitelisted: false,
      blacklisted: false,

      trustworthy: null,
      childsafe: null,
      wot: {},
      google: {}
    }

    if (constants.urlWhitelist.includes(domain)) result.whitelisted = true;
    if (constants.urlBlacklist.includes(domain)) result.blacklisted = true;

    const wot = wotData[domain];
    if (wot) {
      if (wot[0]) result.trustworthy = wot[0];
      if (wot[4]) result.childsafe = wot[4];
      if (wot.categories) for (const i in wot.categories) result.wot[constants.linkCategories[parseInt(i)]] = wot.categories[i];
    }
    
    const google = googleData.find(m => m.url == link)
    if (google) result.google = google;

    if (!result.whitelisted && (
      result.blacklisted ||
      Object.keys(wot.categories || {}).map(parseInt).map(categ => constants.badLinkCategories.includes(categ)).find(categ => categ) ||
      (result.childsafe && result.childsafe[0] <= 60 && result.childsafe[1] >= 8) ||
      (result.trustworthy && result.trustworthy[0] <= 60 && result.trustworthy[1] >= 8)
    )) result.safe = false;

    return result;
  }))))
})

// https://stackoverflow.com/a/57714483
function flat(input, depth = 1, stack = []) {
    for (let item of input) if (item instanceof Array && depth > 0) flat(item, depth - 1, stack); else stack.push(item);
    return stack;
}
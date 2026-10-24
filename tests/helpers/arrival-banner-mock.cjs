// The session card's morning banner, for tests that render result sheets: the
// same words the real banner shows, without its scene or the rewards store.
const React = require("react");
const durationLabel = seconds => {
  const minutes = Math.floor(seconds / 60), remainder = seconds % 60;
  return [minutes > 0 ? `${minutes} min` : null, remainder > 0 || minutes === 0 ? `${remainder} sec` : null].filter(Boolean).join(" ");
};
function ArrivalBanner({ seconds, title, levelUp = false }) {
  return React.createElement("Arrival", { testID: "session-arrival", levelUp },
    React.createElement("Text", null, levelUp ? "Level up" : "Time recorded"),
    React.createElement("Text", null, durationLabel(seconds)),
    title ? React.createElement("Text", null, title) : null);
}
module.exports = { __esModule: true, default: ArrivalBanner };

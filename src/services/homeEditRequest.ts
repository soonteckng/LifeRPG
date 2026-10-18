/** Settings can ask Home to open in Rearrange mode; Home takes the request once, when it is next shown. */
let requested = false;
export const homeEditRequest = {
  ask() { requested = true; },
  take() { const value = requested; requested = false; return value; },
};

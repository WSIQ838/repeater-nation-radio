// Example plugins offered in Settings › Plugins. Their files live in plugins/examples so
// plugin authors can copy them.
import rogerBeepPack from "../../plugins/examples/roger-beep-pack.js?raw";
import starter from "../../plugins/examples/starter.js?raw";
import netCounter from "../../plugins/examples/net-counter.js?raw";

export const EXAMPLE_PLUGINS=[
  {id:"roger-beep-pack",name:"Roger beep pack",code:rogerBeepPack},
  {id:"my-first-plugin",name:"My first plugin (starter)",code:starter},
  {id:"net-counter",name:"Net check-in counter",code:netCounter},
];

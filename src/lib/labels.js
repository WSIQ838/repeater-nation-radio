// How a radio screen names the zone and channel: "Zone ALL" and "Ch 2 US-West".
// A zone already named "Zone 1" isn't doubled up.
export const zoneLabel=(name,none="All Zones")=>{const z=String(name||"").trim();return !z?none:/^zone\b/i.test(z)?z:`Zone ${z}`};
export const chanLabel=(number,name)=>{const n=String(name||"").trim();return number==null||number===""?n:`Ch ${number}${n?" "+n:""}`};

// Controllers are the people running the dispatch console.
export const controllerLabel=n=>n>1?n+" Controllers online":n===1?"Controller online":"No Controller online";

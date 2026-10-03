// Member statuses (shared as a LiveKit participant attribute) and their CSS class.
export const STATUSES=["Available","En Route","At Scene","Busy","Returning","Out of Service"];
export const statusClass=s=>"st-"+String(s).toLowerCase().replace(/[^a-z]+/g,"-");

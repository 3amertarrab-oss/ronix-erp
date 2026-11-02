'use strict';
const canonical=r=>r==='Project Engineer'?'Project Manager':r;
const admin=u=>['Owner','Project Manager'].includes(canonical(u?.role));
function effective(u){return u&&canonical(u.role)==='Project Manager'?{...u,role:'Owner',actualRole:'Project Manager'}:u;}
function original(u){return u?.actualRole?{...u,role:u.actualRole}:u;}
function migrate(d){for(const u of d.teamUsers||[]){if(u.role==='Project Engineer'){u.previousRole='Project Engineer';u.role='Project Manager';}}for(const p of d.data||[]){if(!p.pm&&p.projectEngineer)p.pm=p.projectEngineer;}}
module.exports={canonical,admin,effective,original,migrate};

import {expect,it} from 'vitest';
import {reportOptionsForUser} from './reports.service';
import {withTestDb,ORG_A,USER_A} from '../../test/harness';
import {users,organisations,organisationMemberships} from '../../db/schema/identity';
import {organisationLocalizationSettings} from '../../db/schema/currency';
it('supplies server business-calendar choices without requiring settings-write/read permission',async()=>withTestDb(async({db})=>{
 await db.insert(users).values({id:USER_A,name:'Report reader',email:'reader@example.test'});await db.insert(organisations).values({id:ORG_A,name:'Reader company'});await db.insert(organisationMemberships).values({organisationId:ORG_A,userId:USER_A,role:'read_only'});
 await db.insert(organisationLocalizationSettings).values({organisationId:ORG_A,timezone:'Pacific/Auckland',financialYearStartMonth:7});
 const result=await reportOptionsForUser(db,USER_A,new Date('2026-10-31T11:30:00Z'));
 expect(result).toMatchObject({organisationName:'Reader company',today:'2026-11-01',timezone:'Pacific/Auckland',financialYearStartMonth:7,financialYearStartDay:1,gstPeriod:null});
}));

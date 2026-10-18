import sql0 from '../../api/sqlite-migrations/0000_initial.sql';
import sql1 from '../../api/sqlite-migrations/0001_index_session_user.sql';
import sql2 from '../../api/sqlite-migrations/0002_business_bank_details.sql';
import sql3 from '../../api/sqlite-migrations/0003_expense_gst_treatment.sql';
import sql4 from '../../api/sqlite-migrations/0004_purchases-payables.sql';
import sql5 from '../../api/sqlite-migrations/0005_item-catalogue-parity.sql';
export const migrations = [{name:"0000_initial.sql",checksum:"e19a413bf39e2f21a35da95584c8294c062bb8e7696eb6e31415f89fcbebea40",sql:sql0},{name:"0001_index_session_user.sql",checksum:"d6642f6ccb129ae288857ecea0b671b9908fbced5fe1454e184098549dd53721",sql:sql1},{name:"0002_business_bank_details.sql",checksum:"09bbbc5b6919b1be9817f42e8d6f03aeeaa57ef7646d2ee57d230b1874045f5d",sql:sql2},{name:"0003_expense_gst_treatment.sql",checksum:"ddbd85725cf333676124f3937ab9013fa346519105886786e80768d1dbdecf5e",sql:sql3},{name:"0004_purchases-payables.sql",checksum:"5c95f60c5f125aa785cfcc78413e0c06f426a6a21bc9d41ba2539db1b87a0176",sql:sql4},{name:"0005_item-catalogue-parity.sql",checksum:"3654292a6ae022e2a2bdff967667270f30cfa9947983397c132adb39303341c7",sql:sql5}];

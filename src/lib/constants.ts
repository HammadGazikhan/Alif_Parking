export const APP_NAME = "Alif Parking Portal";
export const COMPANY_NAME = "Alif Cloud Consulting";

/** Fixed header text copied from the Clover Hills Plaza pass list. */
export const PASS_LIST_LOCATION = "Clover Hills Plaza";
export const PASS_LIST_COMPANY = "ALIFCLOUD IT CONSULTING";
export const PASS_LIST_UNIT_NO = "501/502/509/510";

/** Footer notes copied verbatim from the Clover Hills Plaza pass list. */
export const PASS_LIST_NOTES = [
  " The above format is a standard format according to the software system.",
  "All fields are compulsary.",
  "In case of either or vehicles PLEASE refer to the highlighted format. ",
  "For FREE Category , only permitted number of vehicles from Clover Build Corp should be considered. ",
  "Above list is just a template please edit information according to the respective office/unit.",
  "For any querries/assistance please contact : globalfmspune@gmail.com  9890154547 /propertymanager@cloverhillsplaza.in",
  "Please mail the updated list on above mail addresses.",
  "Previous updated list will be considered for updation in system.",
  "Any changes in the format will be conveyed if required.",
  "Overnight vehicle parking is charged for pass holders too.",
] as const;

export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 100;

/** How long a generated payment QR stays valid. */
export const PAYMENT_QR_TTL_MINUTES = 15;

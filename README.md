# SKU Lab Update Quantity
Need this to pull On Hand quantity from SKU Lab and update the Products Table

# Installation

Download Node: https://nodejs.org/en/download/prebuilt-installer

1. Git Clone or Click on Code and download the zip
2. In the root of the project, run npm install
3. Add ENVs
4. Update table name if needed in code JK you can just do the ENV
5. If this is on the Products table, create a backup for it.
6. Run `npm run start`
7. Review json report
8. Review Table

# ENV
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_KEY=
SKU_LAB_TOKEN=
TABLE_NAME=
```
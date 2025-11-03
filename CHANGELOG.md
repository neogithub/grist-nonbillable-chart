# Changelog - Non-Billable Chart

## v6 - Filter Improvements (2025-11-03)

### Issues Fixed
1. **Removed empty Department & Location filters** - These fields don't exist in Clockify CSV data
2. **Fixed Groups dropdown** - Now parses comma-separated groups (e.g., "Employees, Shared-Interactive") into individual selectable options

### Changes Made

#### HTML (index.html)
- Removed `departmentFilter` dropdown
- Removed `locationFilter` dropdown
- Kept only relevant filters: Groups, Users, Projects, Date Range, Sort

#### JavaScript (scripts.js)
- Added `parseGroups()` function to split comma-separated group values
- Added `recordHasGroup()` function to check if a record contains a specific group
- Updated filter matching logic to work with parsed groups
- Enhanced logging to show group parsing details

### Before & After

**Before:**
```
Groups dropdown showed:
- "Chicago-Admin, Chicago-Creative, Employees"
- "Employees, Shared-Interactive"
- "Add To All Projects, Boston-Admin, Boston-Creative, Employees"
```

**After:**
```
Groups dropdown shows individual groups:
- "Chicago-Admin"
- "Chicago-Creative"
- "Employees"
- "Shared-Interactive"
- etc.
```

### Testing
1. Open chart in Grist
2. Click Groups dropdown - should now show clean list of individual groups
3. Select a group like "Employees" - should filter to show all records containing that group
4. Open Debug panel and click "Dump Records" to see parsing in action

### Backup
All files backed up to `_bak/v6/` before changes

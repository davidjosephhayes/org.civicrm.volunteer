ALTER TABLE `civicrm_volunteer_project`
ADD `display_start_date` date DEFAULT NULL
  AFTER  `title`,
ADD `display_end_date` date DEFAULT NULL
  COMMENT 'Used for specifying fuzzy dates, e.g., this project lasts from 12/01/2015 and 12/31/2015.'
  AFTER  `display_start_date`;
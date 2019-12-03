ALTER TABLE `civicrm_volunteer_need`
ADD `time_weight` DOUBLE DEFAULT 1
  COMMENT 'Used for prepoulating volunteer time_completed_weight value.'
  AFTER  `duration`;
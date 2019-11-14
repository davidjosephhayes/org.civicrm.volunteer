<?php

class CRM_Volunteer_Angular {

  private static $loaded = FALSE;

  /**
   * @return boolean
   */
  public static function isLoaded() {
    return self::$loaded;
  }

  /**
   * Loads dependencies for CiviVolunteer Angular app.
   *
   * @param string $defaultRoute
   *   If the base page is loaded with no route, show this one.
   */
  public static function load($defaultRoute) {
    if (self::isLoaded()) {
      return;
    }

    CRM_Core_Resources::singleton()->addScriptFile('civicrm', 'packages/jquery/plugins/jquery.notify.min.js', 10, 'html-header');

    $resource = CRM_Core_Resources::singleton();
      $resource->addScriptFile('org.civicrm.volunteer', 'js/fullcalendar/lib/moment.min.js', 5, 'html-header');
      $resource->addScriptFile('org.civicrm.volunteer', 'js/fullcalendar/fullcalendar.min.js', 10, 'html-header');
      $resource->addStyleFile('org.civicrm.volunteer', 'js/fullcalendar/fullcalendar.min.css', 10, 'html-header');

    $loader = new \Civi\Angular\AngularLoader();
    

    // Check if fieldmeta extension is installed or not.
    // If installed then add crmFieldMetadata module.
    $result = civicrm_api3('Extension', 'get', [
      'sequential' => 1,
      'full_name' => "org.civicrm.fieldmetadata",
      'status' => "installed",
    ]);

    if($result['count']) {
      $loader->setModules(array('volunteer', 'crmFieldMetadata'));
    } else {
      $loader->setModules(array('volunteer'));
    }

    $loader->setPageName('civicrm/vol');
    $loader->load();
    \Civi::resources()->addSetting(array(
      'crmApp' => array(
        'defaultRoute' => $defaultRoute,
      ),
    ));

    self::$loaded = TRUE;
  }

}

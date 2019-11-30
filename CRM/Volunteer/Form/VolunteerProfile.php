<?php
/*
 +--------------------------------------------------------------------+
 | CiviCRM version 4.4                                                |
 +--------------------------------------------------------------------+
 | Copyright CiviCRM LLC (c) 2004-2013                                |
 +--------------------------------------------------------------------+
 | This file is a part of CiviCRM.                                    |
 |                                                                    |
 | CiviCRM is free software; you can copy, modify, and distribute it  |
 | under the terms of the GNU Affero General Public License           |
 | Version 3, 19 November 2007 and the CiviCRM Licensing Exception.   |
 |                                                                    |
 | CiviCRM is distributed in the hope that it will be useful, but     |
 | WITHOUT ANY WARRANTY; without even the implied warranty of         |
 | MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.               |
 | See the GNU Affero General Public License for more details.        |
 |                                                                    |
 | You should have received a copy of the GNU Affero General Public   |
 | License and the CiviCRM Licensing Exception along                  |
 | with this program; if not, contact CiviCRM LLC                     |
 | at info[AT]civicrm[DOT]org. If you have questions about the        |
 | GNU Affero General Public License or the licensing of CiviCRM,     |
 | see the CiviCRM license FAQ at http://civicrm.org/licensing        |
 +--------------------------------------------------------------------+
 */

require_once 'CRM/Core/Form.php';

/**
 * Form controller class
 *
 * @see http://wiki.civicrm.org/confluence/display/CRMDOC43/QuickForm+Reference
 */
class CRM_Volunteer_Form_VolunteerProfile extends CRM_Core_Form {

  /**
   * The needs the volunteer is signing up for.
   *
   * @var array
   *   need_id => api.VolunteerNeed.getsingle
   * @protected
   */
  protected $_needs = [];

  /**
   * Error messages to display, related to the need IDs passed to the form via URL.
   *
   * @var array
   */
  protected $preProcessErrors = [];

  /**
   * The profile IDs associated with this form and marked
   * for use with the primary contact.
   *
   * Do not use directly; access via $this->getPrimaryVolunteerProfileIDs().
   *
   * @var array
   * @protected
   */
  protected $_primary_volunteer_profile_ids = [];

  /**
   * The contact ID of the primary volunteer.
   *
   * @var int
   */
  protected $_primary_volunteer_id;

  /**
   * Set default values for the form.
   *
   * @access public
   */
  function setDefaultValues() {
    $defaults = [];

    $contact_id = CRM_Core_Session::getLoggedInContactID();

    if ($contact_id) {
      foreach($this->getPrimaryVolunteerProfileIDs() as $profileID) {
        $fields = array_flip(array_keys(CRM_Core_BAO_UFGroup::getFields($profileID)));
        CRM_Core_BAO_UFGroup::setProfileDefaults($contact_id, $fields, $defaults);
      }
    }

    return $defaults;
  }
 
  /**
   * set variables up before form is built
   *
   * @access public
   */
  function preProcess() {

    $contact_id = CRM_Core_Session::getLoggedInContactID();

    if (!$contact_id) {
      $this->preProcessErrors[] = "You must be logged into access your profile.";
      return;
    }

    CRM_Core_Resources::singleton()
        ->addScriptFile('org.civicrm.volunteer', 'js/CRM_Volunteer_Form_VolunteerProfile.js')
        ->addScriptFile('civicrm', 'packages/jquery/plugins/jquery.notify.min.js', -9990, 'html-header', FALSE);

    $this->_action = CRM_Core_Action::UPDATE;
  }

  /**
   * Returns the audience for a given profile.
   *
   * @param array $profile
   *   In the format of api.UFJoin.get.values.
   * @return string
   *   One of 'primary' (the default), 'additional', or 'both.'
   */
  private function getProfileAudience(array $profile) {
    $allowedValues = ['primary', 'additional', 'both'];
    $audience = 'primary';

    $moduleData = json_decode(CRM_Utils_Array::value("module_data", $profile));
    if (property_exists($moduleData, 'audience') && in_array($moduleData->audience, $allowedValues)) {
      $audience = $moduleData->audience;
    }

    return $audience;
  }

  /**
   * Return profiles used for Primary Volunteers
   *
   * @return array
   *   UFGroup (Profile) Ids
   */
  function getPrimaryVolunteerProfileIDs() {
    if (empty($this->_primary_volunteer_profile_ids)) {
      $profileIds = [];

      foreach ($this->_projects as $project) {
        foreach ($project['profiles'] as $profile) {
          if ($this->getProfileAudience($profile) !== "additional") {
            $profileIds[] = $profile['uf_group_id'];
          }
        }
      }

      $this->_primary_volunteer_profile_ids = array_unique($profileIds);
    }

    return $this->_primary_volunteer_profile_ids;
  }

  function buildQuickForm() {

    if (count($this->preProcessErrors)) {
      $this->buildErrorPage();
      return;
    }

    CRM_Utils_System::setTitle(ts('My Volunteer Profile', ['domain' => 'org.civicrm.volunteer']));

    $contactID = CRM_Utils_Array::value('userID', $_SESSION['CiviCRM']);
    $profiles = $this->buildCustom($this->getPrimaryVolunteerProfileIDs(), $contactID);
    $this->assign('customProfiles', $profiles);

    $this->addButtons([
      [
        'type' => 'done',
        'name' => ts('Submit', ['domain' => 'org.civicrm.volunteer']),
        'isDefault' => TRUE,
      ],
      [
        'type' => 'cancel',
        'name' => ts('Cancel', ['domain' => 'org.civicrm.volunteer']),
      ],
    ]);

    CRM_Core_Resources::singleton()->addStyleFile('org.civicrm.volunteer', 'css/signup.css');
  }

  /**
   * @todo per totten's suggestion, wrap all these writes in a transaction;
   * see http://wiki.civicrm.org/confluence/display/CRMDOC43/Transaction+Reference
   */
  function postProcess() {
    $cid = CRM_Utils_Array::value('userID', $_SESSION['CiviCRM'], NULL);
    $values = $this->controller->exportValues();

    $profileFields = $this->getProfileFields($this->getPrimaryVolunteerProfileIDs());
    $profileFieldsByType = array_reduce($profileFields, [$this, 'reduceByType'], []);
    $activityFields = CRM_Utils_Array::value('Activity', $profileFieldsByType, []);
    $activityValues = array_intersect_key($values, $activityFields);
    $contactValues = array_diff_key($values, $activityValues);

    $this->_primary_volunteer_id = $this->processContactProfileData($contactValues, $profileFields, $cid);

    $statusMsg = ts('Awesome! We appreciate you keeping your profile up to date.', ['domain' => 'org.civicrm.volunteer']);
    CRM_Core_Session::setStatus($statusMsg, '', 'success');
    CRM_Core_Session::singleton()->pushUserContext($this->_destination);
  }

  /**
   * @param array $profileIds
   *   An array of IDs
   * @return array
   *   An array of fieldData, keyed by fieldName
   */
  private function getProfileFields(array $profileIds) {
    $profileFields = [];
    foreach ($profileIds as $profileID) {
      $profileFields += CRM_Core_BAO_UFGroup::getFields($profileID);
    }
    return $profileFields;
  }

  /**
   * Callback for array_reduce.
   *
   * @link http://php.net/manual/en/function.array-reduce.php
   */
  private function reduceByType($carry, $item) {
    $fieldName = $item['name'];
    $fieldType = $item['field_type'];
    $carry[$fieldType][$fieldName] = $item;
    return $carry;
  }

  /**
   * Process the data returned by a completed profile
   *
   * @param array $profileValues
   *   The data the user submitted to the Signup page for a given profile
   * @param array $profileFields
   *   A list of field definitions for this profile
   * @param int $cid
   *   The Contact ID of the user for whom this profile is being processed
   *
   * @return int
   *   The contact id of the user for whom this data was saved (This can be a new contact)
   */
  private function processContactProfileData(array $profileValues, array $profileFields, $cid = null) {
    // Search for duplicate
    if (!$cid) {
      $dedupeParams = CRM_Dedupe_Finder::formatParams($profileValues, 'Individual');
      $dedupeParams['check_permission'] = FALSE;
      $ids = CRM_Dedupe_Finder::dupesByParams($dedupeParams, 'Individual');
      if ($ids) {
        $cid = $ids[0];
      }
    }

    return CRM_Contact_BAO_Contact::createProfileContact(
      $profileValues,
      $profileFields,
      $cid
    );
  }

  /**
   * Adds profiles to the form.
   *
   * @param array $profileIds
   *   The profiles to prepare for the template.
   * @param int $contactID
   *   The contact whose information will be input into/displayed in the profiles.
   * @param type $prefix
   *   The prefix to give to the field names in the profiles.
   * @return array
   *   Returns an array of field definitions that have been added to the form.
   *   This result can be passed to a Smarty template as a variable.
   */
  function buildCustom(array $profileIds = [], $contactID = null, $prefix = '') {
    $profiles = [];
    $fieldList = []; // master field list

    foreach($profileIds as $profileID) {
      $fields = CRM_Core_BAO_UFGroup::getFields($profileID, FALSE, CRM_Core_Action::ADD,
        NULL, NULL, FALSE, NULL,
        FALSE, NULL, CRM_Core_Permission::CREATE,
        'field_name', TRUE
      );

      foreach ($fields as $key => $field) {
        if (array_key_exists($key, $fieldList)) continue;

        CRM_Core_BAO_UFGroup::buildProfile(
          $this,
          $field,
          CRM_Profile_Form::MODE_CREATE,
          $contactID,
          TRUE,
          null,
          null,
          $prefix
        );
        $profiles[$profileID][$key] = $fieldList[$key] = $field;
      }
    }
    return $profiles;
  }

  /**
   * Subroutine of buildQuickForm. Used to display preProcessing validation
   * errors to the user. Prevents the display of form elements.
   */
  private function buildErrorPage() {
    CRM_Utils_System::setTitle(ts('We hit a snag', ['domain' => 'org.civicrm.volunteer']));
    $region = CRM_Core_Region::instance('page-body');
    $region->update('default', [
      'disabled' => TRUE,
    ]);
    $region->add([
      'template' => 'CRM/Volunteer/Form/Error.tpl',
    ]);
    $this->assign('errors', $this->preProcessErrors);
  }

}

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
   * Error messages to display, related to the need IDs passed to the form via URL.
   *
   * @var array
   */
  protected $preProcessErrors = [];

  /**
   * The profile IDs associated with this form and marked
   * for use with the primary contact.
   *
   * Do not use directly; access via $this->getContactProfileIds().
   *
   * @var array
   * @protected
   */
  protected $_contact_profile_ids = [];

  /**
   * The contact ID of the primary volunteer.
   *
   * @var int
   */
  protected $_contact_id;

  /**
   * The contact infomrat.
   *
   * @var array
   */
  protected $_contact;

  /**
   * Set default values for the form.
   *
   * @access public
   */
  function setDefaultValues() {
    $defaults = [];

    $contact_id = CRM_Core_Session::getLoggedInContactID();

    if ($contact_id) {
      foreach($this->getContactProfileIds() as $profileID) {
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

    try {
      $this->getContact();
    } catch (CRM_Core_Exception $e) {
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
  protected function getProfileAudience(array $profile) {
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
  function getContactProfileIds() {
    if (empty($this->_contact_profile_ids)) {
      
      $coreDefaultProfile = [
        "is_active" => "1",
        "module" => "CiviVolunteer",
        "entity_table" => "civicrm_volunteer_project",
        "weight" => 1,
        "module_data" => ["audience" => "primary"],
        "uf_group_id" => civicrm_api3('UFGroup', 'getvalue', [
          "name" => "volunteer_sign_up",
          "return" => "id"
        ]),
      ];
  
      $this->_contact_profile_ids = civicrm_api3('Setting', 'getvalue', [
        'name' => 'volunteer_profile_default_profiles',
      ]);
    }
    
    return $this->_contact_profile_ids;
  }

  function buildQuickForm() {

    if (count($this->preProcessErrors)) {
      $this->buildErrorPage();
      return;
    }

    CRM_Utils_System::setTitle(ts('My Volunteer Profile', ['domain' => 'org.civicrm.volunteer']));

    $contact = $this->getContact();    
    $this->assign('contact', $contact);
    
    $profiles = $this->buildCustom($this->getContactProfileIds());
    $this->assign('customProfiles', $profiles);

    $this->addButtons([
      [
        'type' => 'done',
        'name' => ts('Save', ['domain' => 'org.civicrm.volunteer']),
        'isDefault' => TRUE,
      ],
      // [
      //   'type' => 'cancel',
      //   'name' => ts('Cancel', ['domain' => 'org.civicrm.volunteer']),
      // ],
    ]);

    CRM_Core_Resources::singleton()->addStyleFile('org.civicrm.volunteer', 'css/profile.css');
  }

  /**
   * @todo per totten's suggestion, wrap all these writes in a transaction;
   * see http://wiki.civicrm.org/confluence/display/CRMDOC43/Transaction+Reference
   */
  function postProcess() {
    
    try {
      $this->getContact();
    } catch (CRM_Core_Exception $e) {
      $this->preProcessErrors[] = "You must be logged into access your profile.";
      return;
    }

    $values = $this->controller->exportValues();

    $profileFields = $this->getProfileFields($this->getContactProfileIds());
    $profileFieldsByType = array_reduce($profileFields, [$this, 'reduceByType'], []);
    $activityFields = CRM_Utils_Array::value('Activity', $profileFieldsByType, []);
    $activityValues = array_intersect_key($values, $activityFields);
    $contactValues = array_diff_key($values, $activityValues);

    $this->_contact_id = $this->processContactProfileData($contactValues, $profileFields);

    $statusMsg = ts('Awesome! We appreciate you keeping your profile up to date.', ['domain' => 'org.civicrm.volunteer']);
    CRM_Core_Session::setStatus($statusMsg, '', 'success');
    CRM_Core_Session::singleton()->pushUserContext($this->_destination);
  }

  /**
   * Get the contact using this form
   * @return array
   *   An array of contact information
   * @throws \CRM_Core_Exception
   */
  protected function getContact() {

    if (empty($this->_contact)) {
      
      $contact_id = CRM_Core_Session::getLoggedInContactID();

      if (!$contact_id)
        throw new CRM_Core_Exception('Could not find logged in contact');
      
      try {
        
        $contact = civicrm_api3('Contact', 'getsingle', ['id' => $contact_id]);
        $contact['image_URL'] = CRM_Utils_String::unstupifyUrl($contact['image_URL']);
        $this->_contact = $contact;

      } catch (Exception $e) {
        throw new CRM_Core_Exception('Could not find logged in contact record');
      }

    }

    return $this->_contact;
  }

  /**
   * @param array $profileIds
   *   An array of IDs
   * @return array
   *   An array of fieldData, keyed by fieldName
   */
  protected function getProfileFields(array $profileIds) {
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
  protected function reduceByType($carry, $item) {
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
   *
   * @return int
   *   The contact id of the user for whom this data was saved (This can be a new contact)
   */
  protected function processContactProfileData(array $profileValues, array $profileFields) {
    
    $contact = $this->getContact();   

    return CRM_Contact_BAO_Contact::createProfileContact(
      $profileValues,
      $profileFields,
      $contact['id']
    );
  }

  /**
   * Adds profiles to the form.
   *
   * @param array $profileIds
   *   The profiles to prepare for the template.
   * @param type $prefix
   *   The prefix to give to the field names in the profiles.
   * @return array
   *   Returns an array of field definitions that have been added to the form.
   *   This result can be passed to a Smarty template as a variable.
   */
  function buildCustom(array $profileIds = [], $prefix = '') {

    $contact = $this->getContact();

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
          $contact['id'],
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
  protected function buildErrorPage() {
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

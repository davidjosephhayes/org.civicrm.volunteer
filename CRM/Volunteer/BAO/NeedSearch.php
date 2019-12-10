<?php

class CRM_Volunteer_BAO_NeedSearch {

  /**
   * @var array
   *   Holds project data for the Needs matched by the search. Keyed by project ID.
   */
  private $projects = [];

  /**
   * @var array
   *   See  getDefaultSearchParams() for format.
   */
  private $searchParams = [];

  /**
   * @var array
   *   An array of needs. The results of the search, which will ultimately be returned.
   */
  private $searchResults = [];

  /**
   * @var integer
   *   Count of search results w/o limt
   */
  private $total = null;

  /**
   * @param array $userSearchParams
   *   See setSearchParams();
   */
  public function __construct ($userSearchParams) {
    $this->searchParams = $this->getDefaultSearchParams();
    $this->setSearchParams($userSearchParams);
  }

  /**
   * Convenience static method for searching without instantiating the class.
   *
   * Invoked from the API layer.
   *
   * @param array $userSearchParams
   *   See setSearchParams();
   * @return array [$this->searchResults, $this->total]
   */
  public static function doSearch ($userSearchParams) {
    $searcher = new self($userSearchParams);
    return [$searcher->search(), $searcher->total()];
  }

  /**
   * @return array
   *   Used as the starting point for $this->searchParams.
   */
  private function getDefaultSearchParams() {
    return [
      'project' => [
        'is_active' => 1,
      ],
      'need' => [
        'role_id' => [],
      ],
      'options' => [
        'sort' => 'project.id asc',
        'offset' => 0,
        'limit' => 0,
      ],
    ];
  }

  /**
   * Performs the search.
   *
   * Stashes the results in $this->searchResults.
   *
   * @return array $this->searchResults
   */
  public function search() {

    // Get volunteer_role_option_group_id of volunteer_role".
    $result = civicrm_api3('OptionGroup', 'get', [
      'sequential' => 1,
      'name' => "volunteer_role",
    ]);
    $volunteer_role_option_group_id = $result['id'];

    $placeholders = [];

    // Prepare select query for preparing fetch opportunity.
    // Join relevant table of need.
    $select = " 
      SELECT SQL_CALC_FOUND_ROWS
        project.id,
        project.title,
        project.description,
        project.is_active,
        project.loc_block_id,
        project.campaign_id,
        need.id as need_id,
        need.start_time,
        need.end_time,
        need.duration,
        need.quantity,
        need.is_flexible,
        need.visibility_id,
        need.is_active as need_active,
        need.created as need_created,
        need.last_updated as need_last_updated,
        need.role_id as role_id,
        addr.name as address_name,
        addr.street_address,
        addr.city, addr.postal_code,
        country.name as country,
        state.name as state_province,
        opt.label as role_label,
        opt.description as role_description,
        campaign.title as campaign_title
    ";
    $from = " FROM civicrm_volunteer_project AS project";
    $join = "
      LEFT JOIN civicrm_volunteer_need AS need
        ON (need.project_id = project.id)
      LEFT JOIN civicrm_loc_block AS loc
        ON (loc.id = project.loc_block_id)
      LEFT JOIN civicrm_address AS addr
        ON (addr.id = loc.address_id)
      LEFT JOIN civicrm_country AS country
        ON (country.id = addr.country_id)
      LEFT JOIN civicrm_state_province AS state
        ON (state.id = addr.state_province_id)
      LEFT JOIN civicrm_campaign AS campaign
        ON (campaign.id = project.campaign_id) 
    ";

    // Get beneficiary_rel_no for volunteer_project_relationship type.
    $beneficiary_rel_no = CRM_Core_PseudoConstant::getKey("CRM_Volunteer_BAO_ProjectContact", 'relationship_type_id', 'volunteer_beneficiary');
    // Join Project Contact table for benificiary for specific $beneficiary_rel_no.
    // Join civicrm_option_value table for role details of need.
    // Join civicrm_contact table for contact details.
    $select .= ", 
      GROUP_CONCAT(IFNULL(cc.id, '') SEPARATOR '~|~') as beneficiary_id,
      GROUP_CONCAT(IFNULL(cc.display_name, '') SEPARATOR '~|~') as beneficiary_display_name,
      GROUP_CONCAT(IFNULL(ce.email, '') SEPARATOR '~|~') as beneficiary_email,
      GROUP_CONCAT(IFNULL(cc.image_URL, '') SEPARATOR '~|~') as beneficiary_image_URL
    ";
    $join .= "
      LEFT JOIN civicrm_volunteer_project_contact AS pc
        ON (pc.project_id = project.id And pc.relationship_type_id='".$beneficiary_rel_no."')
      LEFT JOIN civicrm_option_value AS opt
        ON (opt.value = need.role_id And opt.option_group_id='".$volunteer_role_option_group_id."')
      LEFT JOIN civicrm_contact AS cc 
        ON (cc.id = pc.contact_id)
      LEFT JOIN civicrm_email AS ce
        ON ce.id = (
          SELECT id
          FROM civicrm_email AS ceq
          WHERE ceq.contact_id = pc.contact_id AND ceq.is_primary=1
          LIMIT 1
        )
    ";

    $visibility_id = CRM_Volunteer_BAO_Project::getVisibilityId('name', "public");
    $i_visibility_id = count($placeholders)+1;
    $placeholders[$i_visibility_id] = [$visibility_id, 'Positive'];
    $where = "
      WHERE 1
        AND project.is_active = 1
        AND need.visibility_id = %$i_visibility_id
    ";

    /**
     * Match CRM_Volunteer_BAO_Project::_get_open_needs as must as possible
     */
    // // debugging
    // $select .= "
    //   ,IF(need.start_time IS NOT NULL, 1, 0) AS start_time_not_null
    //   ,IF(need.start_time IS NOT NULL, 1, 0) AS not_full
    //   ,IF(DATE_FORMAT(need.start_time,'%Y-%m-%d')>=CURDATE(), 1, 0) AS after_start_time
    //   ,IF(
    //     need.end_time IS NOT NULL AND
    //     DATE_FORMAT(need.end_time,'%Y-%m-%d')>=CURDATE()
    //     , 1, 0
    //   ) AS after_end_time,
    //   IF(
    //     need.end_time IS NULL AND
    //     need.duration IS NULL
    //     , 1, 0
    //   ) AS end_time_duration_null
    // ";
    // join in assignments TODO, optimize, pry pretty slow as db get large
    $assignmentQuery = CRM_Volunteer_BAO_Assignment::retrieveQuery([], []);
    $join .= "
      LEFT JOIN ( 
        SELECT COUNT(*) AS quantity_assigned, need_id
        FROM (
          ". $assignmentQuery . "
        ) AS assignment_query
        GROUP BY need_id
      ) AS assignment_query_count
        ON assignment_query_count.need_id = need.id
    ";
    // open needs must have a start time; this disqualifies flexible needs
    $where .= "
      AND need.start_time IS NOT NULL
    ";
    // open needs must not have all positions assigned
    $where .= "
      AND (
        assignment_query_count.quantity_assigned IS NULL OR
        assignment_query_count.quantity_assigned<need.quantity
      )
    ";
    // 1) start after now, or
    // 2) end after now, or
    // 3) be open until filled
    $where .= "
      AND (
        DATE_FORMAT(need.start_time,'%Y-%m-%d')>=CURDATE() OR
        (
          need.end_time IS NOT NULL AND
          DATE_FORMAT(need.end_time,'%Y-%m-%d')>=CURDATE()
        ) OR (
          need.end_time IS NULL AND
          need.duration IS NULL 
        )
      )
    ";

    // search role and project information
    if(!empty($this->searchParams['need']['search'])) {
      // loose text search, split up works and check on each word
      $search = trim($this->searchParams['need']['search']);
      $search_fragments = preg_split('/[\s+,]/', $search);
      $search_wheres = [];
      foreach ($search_fragments as $search_fragment) {
        $i_search = count($placeholders)+1;
        $placeholders[$i_search] = ["%$search_fragment%", 'String'];
        $search_wheres[] = "(
          opt.label LIKE %$i_search OR
          project.title LIKE %$i_search
        )";
      }
      $where .= ' AND (' . implode(' AND ', $search_wheres) . ') ';
    }

    $fromdate = CRM_Utils_Array::value('date_start', $this->searchParams['need'], '');
    $todate = CRM_Utils_Array::value('date_end', $this->searchParams['need'], '');
    if (!empty($fromdate) || !empty($todate)) {

      $i_fromdate = count($placeholders)+1;
      $placeholders[$i_fromdate] = [$fromdate, 'String'];
      $i_todate = count($placeholders)+1;
      $placeholders[$i_todate] = [$todate, 'String'];
      
      if (!empty($fromdate) && !empty($todate)) {
        $where .= " AND (
          (
            DATE_FORMAT(need.start_time,'%Y-%m-%d')>=%$i_fromdate AND
            DATE_FORMAT(need.start_time,'%Y-%m-%d')<=%$i_todate AND
            need.end_time IS NULL 
          ) OR ( 
            DATE_FORMAT(need.start_time,'%Y-%m-%d')>=%$i_fromdate AND 
            DATE_FORMAT(need.start_time,'%Y-%m-%d')<=%$i_todate AND 
            need.end_time IS NOT NULL AND
            DATE_FORMAT(need.end_time,'%Y-%m-%d')>=%$i_fromdate AND
            DATE_FORMAT(need.end_time,'%Y-%m-%d')<=%$i_todate
          )
        )";
      } else if (!empty($fromdate)) {
        $where .= "
          AND (DATE_FORMAT(need.start_time,'%Y-%m-%d')>=%$i_fromdate)
          AND (
            need.end_time IS NULL OR
            DATE_FORMAT(need.end_time,'%Y-%m-%d')>=%$i_fromdate
          )
        ";
      } else if (!empty($todate)) {
        $where .= "
        AND (DATE_FORMAT(need.start_time,'%Y-%m-%d')<=%$i_todate)
        AND (
          need.end_time IS NULL OR
          DATE_FORMAT(need.end_time,'%Y-%m-%d')<=%$i_todate
        )
        ";
      }
    }

    // Add role filter if passed in UI.
    if(!empty($this->searchParams['need']['role_id'])) {
      $role_id_string = implode(",", array_map(function($role_id)use(&$placeholders){
        $i_role_id = count($placeholders)+1;
        $placeholders[$i_role_id] = [$role_id, 'Positive'];
        return "%$i_role_id";
      }, $this->searchParams['need']['role_id']));
      $where .= " AND need.role_id IN (".$role_id_string.")";
    }
    
    // Add assignee_contact_id filter if passed in UI.
    if(!empty($this->searchParams['need']['assignee_contact_id'])) {
      $assignmentCustomGroup = CRM_Volunteer_BAO_Assignment::getCustomGroup();
      $assignmentCustomFields = CRM_Volunteer_BAO_Assignment::getCustomFields();
      $assignmentCustomTableName = $assignmentCustomGroup['table_name'];
      $assignmentQuery = CRM_Volunteer_BAO_Assignment::retrieveQuery([
        'assignee_contact_id' => $this->searchParams['need']['assignee_contact_id'],
      ], [
        "{$assignmentCustomTableName}.{$assignmentCustomFields['volunteer_need_id']['column_name']} = need.id"
      ]);
      $where .= " AND EXISTS (". $assignmentQuery .")";
    }

    // Add with(benificiary) filter if passed in UI.
    if(!empty($this->searchParams['project']['project_contacts']['volunteer_beneficiary'])) {
      $beneficiary_id_string = implode(",", array_map(function($beneficiary_id)use(&$placeholders){
        $i_beneficiary_id = count($placeholders)+1;
        $placeholders[$i_beneficiary_id] = [$beneficiary_id, 'Positive'];
        return "%$i_beneficiary_id";
      }, $this->searchParams['project']['project_contacts']['volunteer_beneficiary']));
      $where .= " AND pc.contact_id IN (".$beneficiary_id_string.")";
    }

    // Add Location filter if passed in UI.
    if(!empty($this->searchParams['project']["proximity"])) {
      $proximityquery = CRM_Volunteer_BAO_Project::buildProximityWhere($this->searchParams['project']["proximity"]);
      $proximityquery = str_replace("civicrm_address", "addr", $proximityquery);
      $where .= " AND ".$proximityquery;
    }

    // If Project Id is passed from URL- Query String.
    if(!empty($this->searchParams['project'])) {
      if(isset($this->searchParams['project']['is_active']) && isset($this->searchParams['project']['id'])) {
        $i_project_id = count($placeholders)+1;
        $placeholders[$i_project_id] = [$this->searchParams['project']['id'], 'Positive'];
        $where .= "
          AND project.id = %$i_project_id 
        ";
      }
    }

    // Order and limit by Logic.
    $orderby = "
      GROUP BY need.id
      ORDER BY " . CRM_Core_DAO::escapeString($this->searchParams['options']['sort']);
    $limit = $this->searchParams['options']['limit'] === 0 ?  "" : "
      LIMIT " . (int)$this->searchParams['options']['offset'] . ", " . (int)$this->searchParams['options']['limit'];
    
    // Prepare whole sql query dynamic.
    $sql = $select . $from . $join . $where . $orderby . $limit;
    // die(CRM_Core_DAO::composeQuery($sql, $placeholders));

    $dao = CRM_Core_DAO::executeQuery($sql, $placeholders);
    $this->total = (int)CRM_Core_DAO::singleValueQuery('SELECT FOUND_ROWS()');

    // Prepare array for need of projects.
    $project_opportunities = [];
    $i = 0;
    $config = CRM_Core_Config::singleton();
    $timeFormat = $config->dateformatDatetime;
    $contact_id = CRM_Core_Session::getLoggedInContactID();
    while ($dao->fetch()) {
      $project_opportunities[$i]['id'] = $dao->need_id;
      $project_opportunities[$i]['project_id'] = $dao->id;
      $project_opportunities[$i]['is_flexible'] = $dao->is_flexible;
      $project_opportunities[$i]['visibility_id'] = $dao->visibility_id;
      $project_opportunities[$i]['is_active'] = $dao->need_active;
      $project_opportunities[$i]['quantity'] = (int)$dao->quantity;
      $project_opportunities[$i]['quantity_assigned'] = (int)CRM_Volunteer_BAO_Need::getAssignmentCount($dao->need_id);
      $project_opportunities[$i]['quantity_available'] = $project_opportunities[$i]['quantity'] - $project_opportunities[$i]['quantity_assigned'];
      $project_opportunities[$i]['quantity_assigned_current_user'] = $contact_id === null ? 0 : (int)CRM_Volunteer_BAO_Need::getAssignmentCount($dao->need_id, $contact_id);
      $project_opportunities[$i]['created'] = $dao->need_created;
      $project_opportunities[$i]['last_updated'] = $dao->need_last_updated;
      if(isset($dao->start_time) && !empty($dao->start_time)) {
        $project_opportunities[$i]['start_time'] = $dao->start_time;
        $project_opportunities[$i]['duration'] = $dao->duration;
        $start_time = CRM_Utils_Date::customFormat($dao->start_time, $timeFormat);
        if(isset($dao->end_time) && !empty($dao->end_time)) {
          $project_opportunities[$i]['end_time'] = $dao->end_time;
          $end_time = CRM_Utils_Date::customFormat($dao->end_time, $timeFormat);
          $project_opportunities[$i]['display_time'] = $start_time ." - ". $end_time;
        } else {
          $project_opportunities[$i]['display_time'] = $start_time;
        }
      } else {
        $project_opportunities[$i]['display_time'] = "Any";
      }
      $project_opportunities[$i]['role_id'] = $dao->role_id;
      if(empty($dao->role_label)) {
        $project_opportunities[$i]['role_label'] = "Any";
      } else {
        $project_opportunities[$i]['role_label'] = $dao->role_label;
      }
      $project_opportunities[$i]['role_description'] = $dao->role_description;
      $project_opportunities[$i]['project']['description'] =  $dao->description;
      $project_opportunities[$i]['project']['id'] =  $dao->id;
      $project_opportunities[$i]['project']['title'] =  $dao->title;
      $project_opportunities[$i]['project']['campaign_title'] = $dao->campaign_title;
      $project_opportunities[$i]['project']['location'] =  [
        "city" => $dao->city,
        "country" => $dao->country,
        "postal_code" => $dao->postal_code,
        "state_province" => $dao->state_province,
        "street_address" => $dao->street_address,
        "name" => $dao->address_name,
      ];
      $beneficiary_id_array = explode('~|~', $dao->beneficiary_id);
      if(!empty($beneficiary_id_array)) {
        $beneficiary_display_name_array = explode('~|~', $dao->beneficiary_display_name);
        $beneficiary_image_URL_array = explode('~|~', $dao->beneficiary_image_URL);
        $beneficiary_email_array = explode('~|~', $dao->beneficiary_email);
        foreach ($beneficiary_id_array as $key => $beneficiary_id) {
          $project_opportunities[$i]['project']['beneficiaries'][$key] = [
            "id" => $beneficiary_id,
            "display_name" => $beneficiary_display_name_array[$key],
            "image_URL" => html_entity_decode($beneficiary_image_URL_array[$key]),
            "email" => $beneficiary_email_array[$key],
          ];
        }
      } else {
        $project_opportunities[$i]['project']['beneficiaries'] = $dao->beneficiary_display_name;
        $project_opportunities[$i]['project']['beneficiary_id'] = $dao->beneficiary_id;
      }

      // // debugging
      // $project_opportunities[$i]['start_time_not_null'] = $dao->start_time_not_null;
      // $project_opportunities[$i]['not_full'] = $dao->not_full;
      // $project_opportunities[$i]['after_start_time'] = $dao->after_start_time;
      // $project_opportunities[$i]['after_end_time'] = $dao->after_end_time;
      // $project_opportunities[$i]['end_time_duration_null'] = $dao->end_time_duration_null;

      $i++;
    }

    $this->searchResults = $project_opportunities;
    return $this->searchResults;
  }

  /**
   * Returns the count of the previous search
   * 
   * @return integer | null if no previous search
   */
  public function total(){
    return $this->total;
  }

  /**
   * Returns TRUE if the need matches the dates in the search criteria, else FALSE.
   *
   * Assumptions:
   *   - Need start_time is never empty. (Only in exceptional cases should this
   *     assumption be false for non-flexible needs. Flexible needs are excluded
   *     from $project->open_needs.)
   *
   * @param array $need
   * @return boolean
   */
  private function needFitsDateCriteria(array $need) {
    $needStartTime = strtotime(CRM_Utils_Array::value('start_time', $need));
    $needEndTime = strtotime(CRM_Utils_Array::value('end_time', $need));

    // There are no date-related search criteria, so we're done here.
    if ($this->searchParams['need']['date_start'] === FALSE && $this->searchParams['need']['date_end'] === FALSE) {
      return TRUE;
    }

    // The search window has no end time. We need to verify only that the need
    // has dates after the start time.
    if ($this->searchParams['need']['date_end'] === FALSE) {
      return $needStartTime >= $this->searchParams['need']['date_start'] || $needEndTime >= $this->searchParams['need']['date_start'];
    }

    // The search window has no start time. We need to verify only that the need
    // starts before the end of the window.
    if ($this->searchParams['need']['date_start'] === FALSE) {
      return $needStartTime <= $this->searchParams['need']['date_end'];
    }

    // The need does not have fuzzy dates, and both ends of the search
    // window have been specified. We need to verify only that the need
    // starts in the search window.
    if ($needEndTime === FALSE) {
      return $needStartTime >= $this->searchParams['need']['date_start'] && $needStartTime <= $this->searchParams['need']['date_end'];
    }

    // The need has fuzzy dates, and both endpoints of the search window were
    // specified:
    return
      // Does the need start in the provided window...
      ($needStartTime >= $this->searchParams['need']['date_start'] && $needStartTime <= $this->searchParams['need']['date_end'])
      // or does the need end in the provided window...
      || ($needEndTime >= $this->searchParams['need']['date_start'] && $needEndTime <= $this->searchParams['need']['date_end'])
      // or are the endpoints of the need outside the provided window?
      || ($needStartTime <= $this->searchParams['need']['date_start'] && $needEndTime >= $this->searchParams['need']['date_end']);
  }

  /**
   * @param array $need
   * @return boolean
   */
  private function needFitsSearchCriteria(array $need) {
    return
      $this->needFitsDateCriteria($need)
      && (
        // Either no role was specified in the search...
        empty($this->searchParams['need']['role_id'])
        // or the need role is in the list of searched-by roles.
        || in_array($need['role_id'], $this->searchParams['need']['role_id'])
      );
  }

  /**
   * @param array $userSearchParams
   *   Supported parameters:
   *     - search: string - search role label and project name
   *     - beneficiary: mixed - an int-like string, a comma-separated list
   *         thereof, or an array representing one or more contact IDs
   *     - project: int-like string representing project ID
   *     - proximity: array - see CRM_Volunteer_BAO_Project::buildProximityWhere
   *     - role_id: mixed - an int-like string, a comma-separated list thereof, or
   *         an array representing one or more role IDs
   *     - date_start: See setSearchDateParams()
   *     - date_end: See setSearchDateParams()
   */
  private function setSearchParams($userSearchParams) {
    $this->setSearchDateParams($userSearchParams);

    $search = CRM_Utils_Array::value('search', $userSearchParams);
    if (CRM_Utils_Type::validate($search, 'String', FALSE)) {
      $this->searchParams['need']['search'] = $search;
    }

    $projectId = CRM_Utils_Array::value('project', $userSearchParams);
    if (CRM_Utils_Type::validate($projectId, 'Positive', FALSE)) {
      $this->searchParams['project']['id'] = $projectId;
    }

    
    $currentUserAssignment = CRM_Utils_Array::value('project', $userSearchParams);
    if (CRM_Utils_Type::validate($currentUserAssignment, 'Boolean', FALSE)) {
      $this->searchParams['project']['current_user_assignment'] = $currentUserAssignment;
    }

    $proximity = CRM_Utils_Array::value('proximity', $userSearchParams);
    if (is_array($proximity)) {
      $this->searchParams['project']['proximity'] = $proximity;
    }

    $beneficiary = CRM_Utils_Array::value('beneficiary', $userSearchParams);
    if ($beneficiary) {
      if (!array_key_exists('project_contacts', $this->searchParams['project'])) {
        $this->searchParams['project']['project_contacts'] = [];
      }
      $beneficiary = is_array($beneficiary) ? $beneficiary : explode(',', $beneficiary);
      $this->searchParams['project']['project_contacts']['volunteer_beneficiary'] = $beneficiary;
    }

    $role = CRM_Utils_Array::value('role_id', $userSearchParams);
    if ($role) {
      $this->searchParams['need']['role_id'] = is_array($role) ? $role : explode(',', $role);
    }

    $targetContactId = CRM_Utils_Array::value('assignee_contact_id', $userSearchParams);
    if (CRM_Utils_Type::validate($targetContactId, 'Positive', FALSE)) {
      $this->searchParams['need']['assignee_contact_id'] = $targetContactId;
    }

    $options = CRM_Utils_Array::value('options', $userSearchParams);
    if ($options) {
      $sort = CRM_Utils_Array::value('sort', $options);
      if ($sort) {
        $this->searchParams['options']['sort'] = $sort;
      }
      $offset = (int)CRM_Utils_Array::value('offset', $options);
      if ($offset) {
        $this->searchParams['options']['offset'] = $offset;
      }
      $limit = (int)CRM_Utils_Array::value('limit', $options);
      if ($limit) {
        $this->searchParams['options']['limit'] = $limit;
      }
    }
  }

  /**
   * Sets date_start and date_need in $this->searchParams to a timestamp or to
   * boolean FALSE if invalid values were supplied.
   *
   * @param array $userSearchParams
   *   Supported parameters:
   *     - date_start: date
   *     - date_end: date
   */
  private function setSearchDateParams($userSearchParams) {
    $this->searchParams['need']['date_start'] = strtotime(CRM_Utils_Array::value('date_start', $userSearchParams));
    $this->searchParams['need']['date_end'] = strtotime(CRM_Utils_Array::value('date_end', $userSearchParams));
  }

  /**
   * Adds 'project' key to each need in $this->searchResults, containing data
   * related to the project, campaign, location, and project contacts.
   */
  private function getSearchResultsProjectData() {
    // api.VolunteerProject.get does not support the 'IN' operator, so we loop
    foreach ($this->projects as $id => &$project) {
      $api = civicrm_api3('VolunteerProject', 'getsingle', [
        'id' => $id,
        'api.Campaign.getvalue' => [
          'return' => 'title',
        ],
        'api.LocBlock.getsingle' => [
          'api.Address.getsingle' => [],
        ],
        'api.VolunteerProjectContact.get' => [
          'options' => ['limit' => 0],
          'relationship_type_id' => 'volunteer_beneficiary',
          'api.Contact.get' => [
            'options' => ['limit' => 0],
          ],
        ],
      ]);

      $project['description'] = $api['description'];
      $project['id'] = $api['id'];
      $project['title'] = $api['title'];

      // Because of CRM-17327, the chained "get" may improperly report its result,
      // so we check the value we're chaining off of to decide whether or not
      // to trust the result.
      $project['campaign_title'] = empty($api['campaign_id']) ? NULL : $api['api.Campaign.getvalue'];

      // CRM-17327
      if (empty($api['loc_block_id']) || empty($api['api.LocBlock.getsingle']['address_id'])) {
        $project['location'] = [
          'name' => NULL,
          'city' => NULL,
          'country' => NULL,
          'postal_code' => NULL,
          'state_provice' => NULL,
          'street_address' => NULL,
        ];
      } else {
        $countryId = $api['api.LocBlock.getsingle']['api.Address.getsingle']['country_id'];
        $country = $countryId ? CRM_Core_PseudoConstant::country($countryId) : NULL;

        $stateProvinceId = $api['api.LocBlock.getsingle']['api.Address.getsingle']['state_province_id'];
        $stateProvince = $stateProvinceId ? CRM_Core_PseudoConstant::stateProvince($stateProvinceId) : NULL;

        $project['location'] = [
          'name' => $api['api.LocBlock.getsingle']['api.Address.getsingle']['name'],
          'city' => $api['api.LocBlock.getsingle']['api.Address.getsingle']['city'],
          'country' => $country,
          'postal_code' => $api['api.LocBlock.getsingle']['api.Address.getsingle']['postal_code'],
          'state_province' => $stateProvince,
          'street_address' => $api['api.LocBlock.getsingle']['api.Address.getsingle']['street_address'],
        ];
      }

      foreach ($api['api.VolunteerProjectContact.get']['values'] as $projectContact) {
        if (!array_key_exists('beneficiaries', $project)) {
          $project['beneficiaries'] = [];
        }

        $project['beneficiaries'][] = [
          'id' => $projectContact['contact_id'],
          'display_name' => $projectContact['api.Contact.get']['values'][0]['display_name'],
        ];
      }
    }

    foreach ($this->searchResults as &$need) {
      $projectId = (int) $need['project_id'];
      $need['project'] = $this->projects[$projectId];
    }
  }

  /**
   * Callback for usort.
   */
  private static function usortDateAscending($a, $b) {
    $startTimeA = strtotime($a['start_time']);
    $startTimeB = strtotime($b['start_time']);

    if ($startTimeA === $startTimeB) {
      return 0;
    }
    return ($startTimeA < $startTimeB) ? -1 : 1;
  }

}
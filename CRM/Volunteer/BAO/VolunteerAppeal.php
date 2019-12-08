<?php
use CRM_Volunteer_ExtensionUtil as E;

class CRM_Volunteer_BAO_VolunteerAppeal extends CRM_Volunteer_DAO_VolunteerAppeal {

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
   * Create a Volunteer Appeal for specific project
   *
   * Takes an associative array and creates a Appeal object. This method is
   * invoked from the API layer.
   *
   * @param array $params
   *   an assoc array of name/value pairs
   *
   * @return CRM_Volunteer_BAO_VolunteerAppeal object
   */
  public static function create(array $params) {
    // Get appeal ID.
    $appealId = CRM_Utils_Array::value('id', $params);
    $projectId = CRM_Utils_Array::value('project_id', $params);

    $op = empty($appealId) ? CRM_Core_Action::ADD : CRM_Core_Action::UPDATE;

    if (!empty($params['check_permissions']) && !CRM_Volunteer_Permission::checkProjectPerms($op, $projectId)) {
      CRM_Utils_System::permissionDenied();

      // FIXME: If we don't return here, the script keeps executing. This is not
      // what I expect from CRM_Utils_System::permissionDenied().
      return FALSE;
    }
    
    // Validate create appeal form parameter.
    $params = self::validateCreateParams($params);
    
   /* Set Image Path for upload image of appeal and uplaod original image and thumb
    * image in folder.
    * Resize image and set 150*150 for thumb image.
    * Thumb image is used for display appeal image on search page.
    */
    // Get the global configuration.
    $config = CRM_Core_Config::singleton();
    // Convert base64 image into image file and Move Upload Image into respective folder.
    $upload_appeal_directory = $config->imageUploadDir.'appeal/';
    $upload_appeal_main_directory = $config->imageUploadDir.'appeal/main/';
    $upload_appeal_thumb_directory = $config->imageUploadDir.'appeal/thumb/';
    $upload_appeal_medium_directory = $config->imageUploadDir.'appeal/medium/';
    // If appeal folder not exist, create appeal folder on civicrm.files folder.
    if (!file_exists($upload_appeal_directory)) {
      mkdir($upload_appeal_directory, 0777, TRUE);
    }
    // If main image folder not exist, create main folder under appeal folder on civicrm.files folder.
    if (!file_exists($upload_appeal_main_directory)) {
      mkdir($upload_appeal_main_directory, 0777, TRUE);
    }
    // If thumb image folder not exist, create thumb folder under appeal folder on civicrm.files folder.
    if (!file_exists($upload_appeal_thumb_directory)) {
      mkdir($upload_appeal_thumb_directory, 0777, TRUE);
    }
    // If medium image folder not exist, create medium folder under appeal folder on civicrm.files folder.
    if (!file_exists($upload_appeal_medium_directory)) {
      mkdir($upload_appeal_medium_directory, 0777, TRUE);
    }
    // If new image is updated then resize that image and move that into folder.
    if(isset($params['image_data'])) {
      $image_parts = explode(";base64,", $params['image_data']);
      $image_base64 = base64_decode($image_parts[1]);
      $current_time = time();
      $file = $upload_appeal_main_directory . $current_time."_".$params['image'];
      file_put_contents($file, $image_base64);
      
      // Resize Image with 150*150 and save into destination folder. 
      $source_path = $upload_appeal_main_directory . $current_time."_".$params['image'];
      $destination_path = $upload_appeal_thumb_directory . $current_time."_".$params['image'];
      $destination_path_for_detail_image = $upload_appeal_medium_directory . $current_time."_".$params['image'];

      if (class_exists('Imagick')) { // Imagick resizing if available

        $imgSmall = new Imagick($source_path);
        $imgProps = $imgSmall->getImageGeometry();
        $width = $imgProps['width'];
        $height = $imgProps['height'];
        $imgSmallDim = 150;
        if ($width > $height) {
            $newHeight = $imgSmallDim;
            $newWidth = ($imgSmallDim  / $height) * $width;
        } else {
            $newWidth = $imgSmallDim ;
            $newHeight = ($imgSmallDim  / $width) * $height;
        }
        $imgSmall->resizeImage($newWidth, $newHeight, Imagick::FILTER_CATROM, 1, true);
        $imgSmall->cropImage($imgSmallDim, $imgSmallDim, floor(abs($newWidth-$imgSmallDim) / 2), floor(abs($newHeight-$imgSmallDim) / 2));
        $imgSmall->writeImage($destination_path);

        $imgMedium = new Imagick($source_path);
        $imgProps = $imgMedium->getImageGeometry();
        $width = $imgProps['width'];
        $height = $imgProps['height'];
        $imgMediumDim = 300;
        if ($width > $height) {
            $newHeight = $imgMediumDim;
            $newWidth = ($imgMediumDim  / $height) * $width;
        } else {
            $newWidth = $imgMediumDim ;
            $newHeight = ($imgMediumDim  / $width) * $height;
        }
        $imgMedium->resizeImage($newWidth, $newHeight, Imagick::FILTER_CATROM, 1, true);
        $imgMedium->cropImage($imgMediumDim, $imgMediumDim, floor(abs($newWidth-$imgMediumDim) / 2), floor(abs($newHeight-$imgMediumDim) / 2));
        $imgMedium->writeImage($destination_path_for_detail_image);

      } else if (function_exists('image_load')) { // native Drupal resizing
        $imgSmall = image_load($source_path);
        image_resize($imgSmall, 150, 150);
        image_save($imgSmall, $destination_path);
        image_resize($imgSmall, 300, 300);
        image_save($imgSmall, $destination_path_for_detail_image);
      } else { // resizing not supported
        CRM_Core_Error::debug_log_message('Image resizing not supported for Volunteer Appeal images', FALSE, 'org.civicrm.volunteer');
      }
    }
    // If image is not updated on edit page, save old image name in database.
    if($params['image'] == $params['old_image']) {
      $params['image'] = $params['old_image'];
    } else {
      $params['image'] = $current_time."_".$params['image'];
    }

    $appeal = new CRM_Volunteer_BAO_VolunteerAppeal();
    $appeal->copyValues($params);
    $appeal->save();

    // Custom data saved in database for appeal if user has set any.
    $customData = CRM_Core_BAO_CustomField::postProcess($params, $appeal->id, 'VolunteerAppeal');
    if (!empty($customData)) {
      CRM_Core_BAO_CustomValueTable::store($customData, 'civicrm_volunteer_appeal', $appeal->id);
    }

    return $appeal;
  }

  /**
   * Strips invalid params, throws exception in case of unusable params.
   *
   * @param array $params
   *   Params for self::create().
   * @return array
   *   Filtered params.
   *
   * @throws Exception
   *   Via delegate.
   */
  private static function validateCreateParams(array $params) {
    if (empty($params['id']) && empty($params['title'])) {
      CRM_Core_Error::fatal(ts('Title field is required for Appeal creation.'));
    }
    if (empty($params['id']) && empty($params['appeal_description'])) {
      CRM_Core_Error::fatal(ts('Appeal Description field is required for Appeal creation.'));
    }

    return $params;
  }

  /**
   * Get a list of Project Appeal matching the params.
   *
   * This function is invoked from within the web form layer and also from the
   * API layer. Special params include:
   * 
   *
   * NOTE: This method does not return data related to the special params
   * outlined above; however, these parameters can be used to filter the list
   * of Projects appeal that is returned.
   *
   * @param array $params
   * @return array of CRM_Volunteer_BAO_VolunteerAppeal objects
   */
  public static function retrieve(array $params) {
    $result = array();
  
    $query = CRM_Utils_SQL_Select::from('`civicrm_volunteer_appeal` vp')->select('*');
    $appeal = new CRM_Volunteer_BAO_VolunteerAppeal();

    $appeal->copyValues($params);
    
    foreach ($appeal->fields() as $field) { 
      $fieldName = $field['name'];

      if (!empty($appeal->$fieldName)) {
        if(isset($appeal->$fieldName) && !empty($appeal->$fieldName) && is_array($appeal->$fieldName)) {
          // Key contains comparator value. eg. "Like, Not Like etc"
          $comparator = key($appeal->$fieldName);
        } else {
          $comparator = "=";
        }
        // Use dynamic comparator based on passed parameter.
        $query->where('!column '.$comparator.' @value', array(
          'column' => $fieldName,
          'value' => $appeal->$fieldName,
        ));
      }
    }

    // Get the global configuration.
    $config = CRM_Core_Config::singleton();
    $upload_appeal_main_directory = $config->imageUploadDir.'appeal/main/';
    $upload_appeal_medium_directory = $config->imageUploadDir.'appeal/medium/';
    $upload_appeal_thumb_directory = $config->imageUploadDir.'appeal/thumb/';
    $default_image_name = "appeal-default-logo-sq.png";

    $dao = self::executeQuery($query->toSQL()); 
    while ($dao->fetch()) {
      $fetchedAppeal = new CRM_Volunteer_BAO_VolunteerAppeal();  
      $daoClone = clone $dao; 
      $fetchedAppeal->copyValues($daoClone);
      if($fetchedAppeal->image == "null" || !$fetchedAppeal->image) {
        // check if the default image exists before we set the image property to it
        if (file_exists($upload_appeal_main_directory . $default_image_name)
          && file_exists($upload_appeal_medium_directory . $default_image_name)
          && file_exists($upload_appeal_thumb_directory . $default_image_name)
        ) {        
          $fetchedAppeal->image = $default_image_name;
        } else {
          $fetchedAppeal->image = null;
        }
      }
      $result[(int) $dao->id] = $fetchedAppeal;
    }

  
    $dao->free();
   
    return $result;
  }

  /**
   * Wrapper method for retrieve
   *
   * @param mixed $id Int or int-like string representing Appeal ID
   * @return CRM_Volunteer_BAO_VolunteerAppeal
   */
  public static function retrieveByID($id) {
    $id = (int) CRM_Utils_Type::validate($id, 'Integer');
    // Get Appeal with location and location address based on appeal ID.
    $api = civicrm_api3('VolunteerAppeal', 'getsingle', array(
      'id' => $id,
      'api.LocBlock.getsingle' => array(
        'api.Address.getsingle' => array(),
      ),
    ));
    if (empty($api['loc_block_id']) || empty($api['api.LocBlock.getsingle']['address_id'])) {
      $api['location'] = "";
    } else {
      $address = "";
      if ($api['api.LocBlock.getsingle']['api.Address.getsingle']['street_address']) {
        $address .= " ".$api['api.LocBlock.getsingle']['api.Address.getsingle']['street_address'];
      }
      if ($api['api.LocBlock.getsingle']['api.Address.getsingle']['street_address'] && ($api['api.LocBlock.getsingle']['api.Address.getsingle']['city'] || $api['api.LocBlock.getsingle']['api.Address.getsingle']['postal_code'])) {
        $address .= ' <br /> ';
      }
      if ($api['api.LocBlock.getsingle']['api.Address.getsingle']['city']) {
        $address .= " ".$api['api.LocBlock.getsingle']['api.Address.getsingle']['city'];
      }
      if ($api['api.LocBlock.getsingle']['api.Address.getsingle']['city'] && $api['api.LocBlock.getsingle']['api.Address.getsingle']['postal_code']) {
        $address .= ', '.$api['api.LocBlock.getsingle']['api.Address.getsingle']['postal_code'];
      } else if ($api['api.LocBlock.getsingle']['api.Address.getsingle']['postal_code']) {
        $address .= $api['api.LocBlock.getsingle']['api.Address.getsingle']['postal_code'];
      }
      $api['location'] = $address;
    }
    // Get Project Details.
    $api2 = civicrm_api3('VolunteerProject', 'getsingle', array(
      'id' => $api['project_id'],
      'api.LocBlock.getsingle' => array(
        'api.Address.getsingle' => array(),
      ),
      'api.VolunteerProjectContact.get' => array(
        'options' => array('limit' => 0),
        'relationship_type_id' => 'volunteer_beneficiary',
        'api.Contact.get' => array(
          'options' => array('limit' => 0),
        ),
      ),
    ));
    $flexibleNeed = civicrm_api('volunteer_need', 'getvalue', array(
      'is_active' => 1,
      'is_flexible' => 1,
      'project_id' => $api['project_id'],
      'return' => 'id',
      'version' => 3,
    ));
    if (CRM_Utils_Array::value('is_error', $flexibleNeed) == 1) {
      $flexibleNeed = NULL;
    } else {
      $flexibleNeed = (int) $flexibleNeed;
    }
    $project = CRM_Volunteer_BAO_Project::retrieveByID($api['project_id']);
    $openNeeds = $project->open_needs;
    $project = $project->toArray();
    $project['available_shifts'] = $openNeeds;
    if (empty($api2['loc_block_id']) || empty($api2['api.LocBlock.getsingle']['address_id'])) {
      $api2['location'] = "";
    } else {
      $address = "";
      if ($api2['api.LocBlock.getsingle']['api.Address.getsingle']['name']) {
        $address .= " ".$api2['api.LocBlock.getsingle']['api.Address.getsingle']['name'];
      }
      if ($api2['api.LocBlock.getsingle']['api.Address.getsingle']['street_address']) {
        $address .= " ".$api2['api.LocBlock.getsingle']['api.Address.getsingle']['street_address'];
      }
      if ($api2['api.LocBlock.getsingle']['api.Address.getsingle']['street_address'] && ($api2['api.LocBlock.getsingle']['api.Address.getsingle']['city'] || $api2['api.LocBlock.getsingle']['api.Address.getsingle']['postal_code'])) {
        $address .= ' <br /> ';
      }
      if ($api2['api.LocBlock.getsingle']['api.Address.getsingle']['city']) {
        $address .= " ".$api2['api.LocBlock.getsingle']['api.Address.getsingle']['city'];
      }
      if ($api2['api.LocBlock.getsingle']['api.Address.getsingle']['city'] && $api2['api.LocBlock.getsingle']['api.Address.getsingle']['postal_code']) {
        $address .= ', '.$api2['api.LocBlock.getsingle']['api.Address.getsingle']['postal_code'];
      } else if ($api2['api.LocBlock.getsingle']['api.Address.getsingle']['postal_code']) {
        $address .= $api2['api.LocBlock.getsingle']['api.Address.getsingle']['postal_code'];
      }
      $project['project_location'] = $address;
    }
    foreach ($api2['api.VolunteerProjectContact.get']['values'] as $projectContact) {
      if (!array_key_exists('beneficiaries', $project)) {
        $project['beneficiaries'] = array();
      }
      $project['beneficiaries'][] = array(
        'id' => $projectContact['contact_id'],
        'display_name' => $projectContact['api.Contact.get']['values'][0]['display_name'],
        'image_URL' => html_entity_decode($projectContact['api.Contact.get']['values'][0]['image_URL']),
        'email' => $projectContact['api.Contact.get']['values'][0]['email'],
      );
    }
    $api['project'] = $project;
    $api['project']['flexibleNeed'] = $flexibleNeed;

    return $api;
  }


  /**
   * @inheritDoc This override adds a little data massaging prior to calling its
   * parent.
   *
   * @deprecated since version 4.7.21-2.3.0
   *   Internal core methods should not be extended by third-party code.
   */
  public function copyValues(&$params, $serializeArrays = FALSE) {
    if (is_a($params, 'CRM_Core_DAO')) {
      $params = get_object_vars($params);
    }

    if (array_key_exists('is_active', $params)) {
      /*
       * don't force is_active to have a value if none was set, to allow searches
       * where the is_active state of appeal is irrelevant
       */
      $params['is_active'] = CRM_Volunteer_BAO_VolunteerAppeal::isOff($params['is_active']) ? 0 : 1;
    }
    return parent::copyValues($params, $serializeArrays);
  }

  /**
   * Convenience static method for searching without instantiating the class.
   *
   * Invoked from the API layer.
   *
   * @param array $userSearchParams
   *   See setSearchParams();
   * @return array $this->searchResults
   */
  public static function doSearch($params) {
    $searcher = new self();
    return [$searcher->search($params), $searcher->total()];
  }
  
  /**
   * Performs the search.
   *
   * Stashes the results in $this->searchResults.
   *
   * @return array $this->searchResults
   */
  public function search($params) {
    
    $show_beneficiary_at_front = 1;
    $seperator = CRM_CORE_DAO::VALUE_SEPARATOR;

    $placeholders = [];

    $select = "
      SELECT SQL_CALC_FOUND_ROWS
        (
          SELECT id 
          FROM civicrm_volunteer_need
          WHERE 1
            AND civicrm_volunteer_need.is_flexible = 1
            AND civicrm_volunteer_need.project_id=p.id
        ) AS need_flexi_id,
        appeal.*,
        addr.name as address_name,
        addr.street_address,
        addr.city,
        addr.postal_code,
        GROUP_CONCAT(DISTINCT need.id) AS need_id,
        mdt.need_start_time
    ";//,mdt.need_start_time
    $from = "
      FROM civicrm_volunteer_appeal AS appeal
    ";
    $join = " 
      LEFT JOIN civicrm_volunteer_project AS p
        ON (p.id = appeal.project_id)
      LEFT JOIN civicrm_loc_block AS loc
        ON (loc.id = appeal.loc_block_id)
      LEFT JOIN civicrm_address AS addr
        ON (addr.id = loc.address_id)
      LEFT JOIN civicrm_volunteer_need AS need
        ON 1
          AND need.project_id = p.id
          AND need.is_active = 1
          AND need.is_flexible = 1
          AND need.visibility_id = 1
      LEFT JOIN (
        SELECT
          MIN(start_time) AS need_start_time, 
          id,
          project_id AS need_project_id
        FROM civicrm_volunteer_need AS need_sort
        WHERE id IS NOT NULL
        GROUP BY project_id
      ) AS mdt
        ON mdt.need_project_id = p.id
    ";     
    if($show_beneficiary_at_front == 1) {
      // Get beneficiary_rel_no for volunteer_project_relationship type.
      $beneficiary_rel_no = CRM_Core_PseudoConstant::getKey("CRM_Volunteer_BAO_ProjectContact", 'relationship_type_id', 'volunteer_beneficiary');
      $i = count($placeholders)+1;
      $placeholders[$i] = [$beneficiary_rel_no, 'Positive'];

      $select .= ", 
        GROUP_CONCAT(IFNULL(cc.id, '') SEPARATOR '~|~') AS beneficiary_id,
        GROUP_CONCAT(IFNULL(cc.display_name, '') SEPARATOR '~|~') as beneficiary_display_name,
        GROUP_CONCAT(IFNULL(ce.email, '') SEPARATOR '~|~') as beneficiary_email,
        GROUP_CONCAT(IFNULL(cc.image_URL, '') SEPARATOR '~|~') as beneficiary_image_URL
      ";
      // Join Project Contact table for benificiary for specific $beneficiary_rel_no.
      // Join civicrm_contact table for contact details.
      $join .= "
        LEFT JOIN civicrm_volunteer_project_contact AS pc
          ON (pc.project_id = p.id And pc.relationship_type_id = %$i)
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
    }
    // Appeal should be active, Current Date between appeal date and related project should be active.
    $where = "
      WHERE 1
        AND p.is_active = 1
        AND appeal.is_appeal_active = 1
        AND CURDATE() BETWEEN appeal.active_fromdate AND appeal.active_todate
    ";

    $search = CRM_Utils_Array::value('search', $params);
    if(!empty($search)) {
      // loose text search, split up works and check on each word
      $search = trim($search);
      $search_fragments = preg_split('/[\s+,]/', $search);
      $search_wheres = [];
      foreach ($search_fragments as $search_fragment) {
        $i_search = count($placeholders)+1;
        $placeholders[$i_search] = ["%$search_fragment%", 'String'];
        $search_wheres[] = "(
          appeal.title LIKE %$i_search OR
          appeal.appeal_description LIKE %$i_search OR
          cc.display_name LIKE %$i_search
        )";
      }
      $where .= ' AND (' . implode(' AND ', $search_wheres) . ') ';
    }

    $having = "";
    // Handle beneficiary filter.
    $beneficiaries = CRM_Utils_Array::value('beneficiaries', $params, []);
    if(!empty($beneficiaries)) {
      if (is_array($beneficiaries)) {
        $beneficiary_ids = $beneficiaries;
      } else {
        $beneficiary_ids = preg_split('/[\s+,]/', trim($beneficiaries));
      }
      if (!empty($beneficiary_ids))  {
        $beneficiary_wheres = [];
        foreach ($beneficiary_ids as $benificiery_id) {
          $i_beneficiary = count($placeholders)+1;
          $placeholders[$i_beneficiary] = [$benificiery_id, 'Positive'];
          $beneficiary_wheres[] = " FIND_IN_SET(%$i_beneficiary, REPLACE(beneficiary_id, '~|~', ',')) ";
        }
        $having .= "
          HAVING (" . implode(' OR ', $beneficiary_wheres) . ") 
        ";
      }
    }

    // If start date and end date filter passed on advance search.
    $fromdate = CRM_Utils_Array::value('fromdate', $params, '');
    $todate = CRM_Utils_Array::value('todate', $params, '');
    if (!empty($fromdate) || !empty($todate)) {
      $select .= ",
        GROUP_CONCAT(DISTINCT advance_need.id) AS need_shift_id
      ";
      $join .= "
        LEFT JOIN civicrm_volunteer_need AS advance_need
          ON 1
            AND advance_need.project_id = p.id
            AND advance_need.is_active = 1
            AND advance_need.visibility_id = 1 
            AND advance_need.is_flexible = 0
      ";
      $i_fromdate = count($placeholders)+1;
      $placeholders[$i_fromdate] = [$fromdate, 'String'];
      $i_todate = count($placeholders)+1;
      $placeholders[$i_todate] = [$todate, 'String'];
      if (!empty($fromdate) && !empty($todate)) {
        $where .= " AND (
          (
            (
              advance_need.start_time IS NOT NULL AND
              DATE_FORMAT(advance_need.start_time,'%Y-%m-%d')>=%$i_fromdate AND
              advance_need.end_time IS NULL 
            ) OR ( 
              advance_need.start_time IS NOT NULL AND
              DATE_FORMAT(advance_need.start_time,'%Y-%m-%d')>=%$i_fromdate AND 
              advance_need.end_time IS NOT NULL AND
              DATE_FORMAT(advance_need.end_time,'%Y-%m-%d')<=%$i_todate
            )
          ) 
        )";
      } else if (!empty($fromdate)) {
        $where .= "
          AND advance_need.start_time IS NOT NULL
          AND (DATE_FORMAT(advance_need.start_time,'%Y-%m-%d')>=%$i_fromdate)
        ";
      } else if (!empty($todate)) {
        $where .= "
          AND advance_need.end_time IS NOT NULL
          AND (DATE_FORMAT(advance_need.end_time,'%Y-%m-%d')<=%$i_todate)
        ";
      }
    }

    // If show appeals done anywhere passed on advance search.
    $show_appeals_done_anywhere = (bool)CRM_Utils_Array::value('show_appeals_done_anywhere', $params, false);
    if($show_appeals_done_anywhere) {
      $where .= "
        AND appeal.location_done_anywhere = 1
      ";
    } else {
      // If show appeal is not set then check postal code, radius and proximity.
      $proximity = CRM_Utils_Array::value('proximity', $params, []);
      if(
        !empty($proximity['postal_code']) || 
        (!empty($proximity['lat']) && !empty($proximity['lon']))
      ) {
        $proximity['radius'] = CRM_Utils_Array::value('radius', $proximity, 2);
        $proximity['unit'] = CRM_Utils_Array::value('unit', $proximity, 'mile');
        try {
          $proximityquery = CRM_Volunteer_BAO_Project::buildProximityWhere($proximity);
          $proximityquery = str_replace("civicrm_address", "addr", $proximityquery);
          $where .= " AND ".$proximityquery;
        } catch(Exception $e) {
          // we have some invalid values
          $where .= ' AND 0 ';
        }
      }
    }

    // If custom field pass from advance search filter.
    $custom_data = CRM_Utils_Array::value('custom_data', $params, []);
    if(!empty($custom_data)) {
      // Get all custom field database tables which are assoicated with Volunteer Appeal.
      $sql_query = "
        SELECT 
          cg.table_name,
          cg.id AS groupID,
          cg.is_multiple,
          cf.column_name,
          cf.id AS fieldID,
          cf.data_type AS fieldDataType,
          cf.option_group_id
        FROM
          civicrm_custom_group cg,
          civicrm_custom_field cf 
        WHERE 1
          AND cf.custom_group_id = cg.id
          AND cg.is_active = 1
          AND cf.is_active = 1 
          AND cg.extends IN ('VolunteerAppeal')
      ";
      $dao10 = CRM_Core_DAO::executeQuery($sql_query);
      // Join all custom field tables with appeal data which are assoicated with VolunteerAppeal.
      while ($dao10->fetch()) {
        $table_name = $dao10->table_name;
        $column_name = $dao10->column_name;
        $fieldID = $dao10->fieldID;
        $table_alias = "table_".$fieldID;
        $optionGroupId = $dao10->option_group_id;
        // Join all custom field tables.
        $join .= "
          LEFT JOIN $table_name $table_alias
            ON appeal.id = $table_alias.entity_id
        ";
        $select .= ", ".$table_alias.".".$column_name;
        foreach ($custom_data as $key => $field_data) {
          if(empty($field_data))
            continue;
            $custom_field_array = explode("_", $key);
          if(empty($custom_field_array[1]))
            continue;
          $custom_field_id = $custom_field_array[1];
          if($custom_field_id != $fieldID) 
            continue;
          // If value is in array then implode with Pipe first and then add in where condition.
          $i_custom_field = count($placeholders)+1;
          if(is_array($field_data)) {
            // TODO -- dont think this works, but isnt used right now
            $field_data_string = implode("|", $field_data);
            $placeholders[$i_custom_field] = [$field_data_string, 'String'];
            $where .= "
              AND CONCAT(',', $table_alias.$column_name, ',') REGEXP '$seperator(%$i_custom_field)$seperator'
            ";
          } else {
            // Otherwise add with like query. -- will return funny results
            if (!empty($optionGroupId)) { // if has option groupid, use a hard =
              $placeholders[$i_custom_field] = ["$field_data", 'String'];
              $where .= "
                AND $table_alias.$column_name = %$i_custom_field
              ";
            } else {
              $placeholders[$i_custom_field] = ["%$field_data%", 'String'];
              $where .= "
                AND $table_alias.$column_name LIKE %$i_custom_field
              ";
            }
          }
        }
      }
    }

    // get options for sort and limit
    $options = CRM_Utils_Array::value('options', $params, []);
    
    // Order by Logic.
    $orderby = '';
    if (!empty($options['sort'])) {
      $allowed_sorts = [
        'upcoming_appeal' => 'mdt.need_start_time',
        'active_fromdate' => 'active_fromdate',
        'title' => 'title',
        'project_beneficiary' => 'cc.display_name',
      ];
      $sort_parts = is_array($sort) ? $sort : preg_split('/,/', $options['sort']);
      $order_bys = [];
      if (!empty($sort_parts)) {
        foreach ($sort_parts as $sort_part) {
          $sort_part = trim($sort_part);
          if (empty($sort_part))
            continue;
          $sort_words = preg_split('/\s+/', $sort_part);
          // Check if we have an allowed order by
          if (empty($allowed_sorts[$sort_words[0]]))
            continue;
          // Grab our sort column from allowed sorts
          $order = $allowed_sorts[$sort_words[0]];
          // Direction defaults to ASC unless DESC is specified
          $dir = strtoupper(\CRM_Utils_Array::value(1, $sort_words, '')) === 'DESC' ? ' DESC' : '';
          // add to order by list
          $order_bys[] = "$order $dir";
        }
      }
      if (!empty($order_bys)) {
        $orderby .= "
          ORDER BY " . implode(', ', $order_bys) . "
        ";
      }
    }

    // Grouping
    $groupby = "
      GROUP By appeal.id
    ";

    // Pagination Logic.
    $paging = '';
    $offset = (int)CRM_Utils_Array::value('offset', $options, 0);
    $offset = $offset<0 ? 0 : $offset;
    $limit = (int)CRM_Utils_Array::value('limit', $options, 10);
    $limit = $limit<0 ? 10 : $limit;
    if ($limit > 0) {
      $paging .= "
        LIMIT $offset, $limit 
      ";
    }

    $sql = $select . $from . $join . $where . $groupby . $having . $orderby . $paging;
    // die(CRM_Core_DAO::composeQuery($sql, $placeholders));

    $dao = CRM_Core_DAO::executeQuery($sql, $placeholders);
    $this->total = (int)CRM_Core_DAO::singleValueQuery('SELECT FOUND_ROWS()');

    // Get the global configuration.
    $config = CRM_Core_Config::singleton();
    $upload_appeal_main_directory = $config->imageUploadDir.'appeal/main/';
    $upload_appeal_medium_directory = $config->imageUploadDir.'appeal/medium/';
    $upload_appeal_thumb_directory = $config->imageUploadDir.'appeal/thumb/';
    $default_image_name = "appeal-default-logo-sq.png";

    $appeals = [];
    // Prepare appeal details array with proper format.
    while ($dao->fetch()) {
      $appeal = [];
      $appeal['id'] = $dao->id;
      $appeal['project_id'] = $dao->project_id;
      $appeal['title'] = $dao->title;
      if($dao->image == "null" || !$dao->image) {
        // check if the default image exists before we set the image property to it
        if (file_exists($upload_appeal_main_directory . $default_image_name)
          && file_exists($upload_appeal_medium_directory . $default_image_name)
          && file_exists($upload_appeal_thumb_directory . $default_image_name)
        ) {        
          $dao->image = $default_image_name;
        } else {
          $dao->image = null;
        }
      }
      $appeal['image'] = $dao->image;
      $appeal['appeal_teaser'] = $dao->appeal_teaser;
      $appeal['appeal_description'] = htmlspecialchars_decode($dao->appeal_description);
      $appeal['location_done_anywhere'] = $dao->location_done_anywhere;
      $appeal['is_appeal_active'] = $dao->is_appeal_active;
      $appeal['active_fromdate'] = $dao->active_fromdate;
      $appeal['active_todate'] = $dao->active_todate;
      $appeal['display_volunteer_shift'] = $dao->display_volunteer_shift;
      $appeal['hide_appeal_volunteer_button'] = $dao->hide_appeal_volunteer_button;
      $appeal['show_project_information'] = $dao->show_project_information;
      $appeal['beneficiary_display_name'] = implode(', ',array_unique(explode('~|~',$dao->beneficiary_display_name)));
      $appeal['need_id'] = $dao->need_id;
      $appeal['need_shift_id'] = $dao->need_shift_id;
      $appeal['need_flexi_id'] = $dao->need_flexi_id;
      if($params["orderby"] == "upcoming_appeal") {
        $appeal['need_start_time'] = $dao->need_start_time;
      }
      // Prepare whole address of appeal in array.
      $address = "";
      if ($dao->address_name) {
        $address .= " ".$dao->address_name;
      }
      if ($dao->street_address) {
        $address .= " ".$dao->street_address;
      }
      if ($dao->street_address && ($dao->city || $dao->postal_code)) {
        $address .= ' <br /> ';
      }
      if ($dao->city) {
        $address .= " ".$dao->city;
      }
      if ($dao->city && $dao->postal_code) {
        $address .= ', '.$dao->postal_code;
      } else if ($dao->postal_code) {
        $address .= $dao->postal_code;
      }
      $appeal['location'] =  $address;
      
      $appeals[] = $appeal;
    }

    $this->searchResults = $appeals;
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

}
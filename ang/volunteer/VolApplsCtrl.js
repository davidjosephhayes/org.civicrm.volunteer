(function (angular, $, _) {

  angular.module('volunteer').config(function ($routeProvider) {
    $routeProvider.when('/volunteer/appeals/:view?', {
      controller: 'VolApplsCtrl',
      // update the search params in the URL without reloading the route     
      templateUrl: '~/volunteer/VolApplsCtrl.html',
      resolve: {
        custom_fieldset_volunteer: function(crmApi) {
          return crmApi('VolunteerAppeal', 'getCustomFieldsetWithMetaVolunteerAppeal', {
            controller: 'VolunteerAppeal'
          });
        },
        supporting_data: function(crmApi, $route) {
          return crmApi('VolunteerUtil', 'getsupportingdata', {
            controller: 'VolunteerAppealDetail',
            appeal_id: $route.current.params.appealId
          });
        },
      }
    });
  });

  angular.module('volunteer').controller('VolApplsCtrl', function(
    $route, $routeParams, $scope, crmApi, $window, custom_fieldset_volunteer, 
    supporting_data, $location, volunteerModalService
  ) {

    if (!$window.location.origin) {
      $window.location.origin = $window.location.protocol + "//" 
      + $window.location.hostname 
      + ($window.location.port ? ':' + $window.location.port : '');
    }

    var ts = $scope.ts = CRM.ts('org.civicrm.volunteer');

    // permission sets
    $scope.canAccessAllProjects = CRM.checkPerm('edit all volunteer projects') || CRM.checkPerm('delete all volunteer projects');
    $scope.canCreateProjects = CRM.checkPerm('create volunteer projects');
    $scope.canEditProjects = CRM.checkPerm('edit all volunteer projects') || CRM.checkPerm('edit own volunteer projects');
    $scope.canManageProjects = CRM.checkPerm('edit all volunteer projects') || CRM.checkPerm('edit own volunteer projects') || CRM.checkPerm('manage own volunteer projects');
    $scope.canDeleteProjects = CRM.checkPerm('delete all volunteer projects') || CRM.checkPerm('delete own volunteer projects');
    $scope.canRegister = CRM.checkPerm('register to volunteer');
    
    //Change reult view
    $scope.changeView= view => {
      view = view || 'grid';
      $location.path("/volunteer/appeals/" + view);
    };

    // Check what view we are using
    let view = $routeParams.view;
    if (!view || !['list', 'grid'].includes(view)) {
      $scope.changeView('grid');
      return;
    }

    // setup our view
    $scope.view = view;
    $scope.template = "~/volunteer/Appeal" + view.charAt(0).toUpperCase() + view.slice(1).toLowerCase() + ".html";

    // Link to calendar view
    $scope.goToCalendar = () => $location.path("/volunteer/opportunities/calendar");

    // link to go to appeal details
    $scope.redirectTo = appealId => $location.path("/volunteer/appeal/"+appealId);

    // link to go to volunteer signup
    $scope.volSignup = (need_flexi_id,projectId,hide_appeal_volunteer_button) => {
      if(hide_appeal_volunteer_button == "1") {
        $location.url("/volunteer/opportunities?project="+projectId+"&hideSearch=1");
      } else {
        $window.location.href =CRM.url("civicrm/volunteer/signup", "reset=1&needs[]="+need_flexi_id+"&dest=" + $scope.view);
      }
    }

    // modal controls
    $scope.openModal = id => volunteerModalService.open(id);
    $scope.closeModal = id => volunteerModalService.close(id);

    // tab controls
    $scope.active = 1;
    $scope.selectTab = value => $scope.active = value;
    $scope.isActive = value => $scope.active===value;

    // Assign custom field set values
    $scope.custom_fieldset_volunteer = custom_fieldset_volunteer.values;

    // Assign supporting data values
    $scope.supporting_data = supporting_data.values;

    // loading flag
    $scope.loading = false;

    // pagination vars
    $scope.offset = 0;
    $scope.limit = 10;
    $scope.calcCurrentPage = () => $scope.currentPage = Math.floor($scope.offset / $scope.limit) + 1;
    $scope.calcTotalPages = () => $scope.totalPages = $scope.totalRec === 0 ? 1 : Math.ceil($scope.totalRec / $scope.limit);
    $scope.currentPage = 1;
    $scope.totalPages = 1;
    $scope.changePage = direction => {
      let nextOffset = $scope.offset + direction * $scope.limit;
      if (nextOffset<0 && $scope.offset === 0) {
        alert('This is the first page');
        return;
      }
      if (nextOffset>=$scope.totalRec) {
        alert('This is the last page');
        return;
      }
      $scope.offset = nextOffset;
      $scope.loadList();
    }

    // sorting vars
    $scope.options = [
      {key:"dateE", val: ts("Upcoming"), order: 'upcoming_appeal', dir: 'DESC'},
      {key:"dateS", val:ts('Newest Opportunities'), order: 'active_fromdate', dir: 'DESC'},
      {key:"titleA", val: ts("Title A-Z"), order: "title", dir: "ASC"},
      {key:"titleD", val: ts("Title Z-A"), order: "title", dir: "DESC"},
      {key:"benfcrA", val: ts("Project Beneficiary A-Z"), order: 'project_beneficiary', dir: 'ASC'},
      {key:"benfcrD", val: ts("Project Beneficiary Z-A"), order: 'project_beneficiary', dir: 'DESC'},
    ];
    $scope.sortValue = $scope.options[0];
    $scope.order = $scope.options[0].order;
    $scope.dir = $scope.options[0].dir;
    $scope.sort = () => {
      $scope.offset = 0;
      $scope.order = $scope.sortValue.order;
      $scope.dir = $scope.sortValue.dir;
      $scope.loadList();
    }

    /**
     *  filter variables
     */
    // default filter set
    const defaultFilters = {
      // text search
      search: '',
      // need dates
      date_start: null,
      date_end: null,
      // beneficiary search
      beneficiary: null,
      // proximity search
      location_finder_way: null,
      postal_code: null,
      lat: null,
      lng: null,
      radius: 2,
      unit: 'miles',
      show_appeals_done_anywhere: false,
      // custom data
      custom_data: [],
    };
    const savedFiltersJson = window.localStorage.getItem('civivolunteer_appeal_filters');
    let savedFilters = {};
    try {
      if (savedFiltersJson !== null) {
        const possibleSavedFilters = JSON.parse(savedFilters);
        savedFilters = possibleSavedFilters;
      }
    } catch(e) {}
    // clone saved and default filter set to active filter object
    $scope.filters = $.extend(true, savedFilters, defaultFilters);
    
    // save filters locally
    $scope.saveFilters = () => window.localStorage.setItem('civivolunteer_appeal_filters', JSON.stringify($scope.filters));
    $scope.saveFilters();
    // proximity vars
    $scope.proximityUnits = [
      {value: 'km', label: ts('km')},
      {value: 'miles', label: ts('miles')}
    ];
    $scope.radiusvalue = [
      {value: 2, label: ts('2')},
      {value: 5, label: ts('5')},
      {value: 10, label: ts('10')},
      {value: 25, label: ts('25')},
      {value: 100, label: ts('100')}
    ];
    $scope.getPosition = () => {
      if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(position => {
          $scope.$apply(function() {
            $scope.filters.lat = position.coords.latitude;
            $scope.filters.lng = position.coords.longitude;
            $scope.saveFilters();
          });  
        });
      } else {
        CRM.alert("Sorry, your browser does not support geolocation.", ts("Error"), "error");
      }
    }
    // Clear checkbox selection in Date and Location Filter.
    $scope.clearLocationFinder = () => {
      $scope.filters.location_finder_way = null;
      $scope.filters.lat = null;
      $scope.filters.lon = null;
      $scope.filters.postal_code = null;
      $scope.displayFilters();
    };
    // trigger filter
    $scope.advFilter = () => {
      $scope.offset = 0;
      $scope.loadList();
      $scope.displayFilters();
      $scope.closeModal('crm-vol-advanced-filters');
      $scope.saveFilters();
    }
    // clear filters
    $scope.resetFilters = () => {
      $scope.offset = 0;
      $scope.filters = $.extend(true, {}, defaultFilters);
      $scope.loadList();
      $scope.displayFilters();
      $scope.saveFilters();
    }
    // parset filters into a display
    $scope.displayFilters = () => {

    };
    $scope.displayFilters();
    
    /**
     * Data load
     */
    // list of appeals
    $scope.appeals = [];
    // method to get list from server and do basic processing, returns promise
    const getAppeals = (params, method) => {
      
      CRM.$('#crm-main-content-wrapper').block();

      return crmApi('VolunteerAppeal', 'getsearchresult', params)
      .then(function (data) {
        
        const appeals = data.values.map(function(appeal){
          appeal.hide_appeal_volunteer_button = parseInt(appeal.hide_appeal_volunteer_button);
          appeal.hide_appeal_volunteer_button = parseInt(appeal.display_volunteer_shift);
          return appeal;
        });
        $scope.appeals = appeals;
                  
        $scope.totalRec = data.total;
        $scope.numberOfPages= Math.ceil($scope.totalRec/$scope.pageSize);
        $scope.closeModal('crm-vol-advanced-filters');
        CRM.$('#crm-main-content-wrapper').unblock();

        var sortOption = $scope.options.findIndex(function(option) {
          return option.key == $scope.sortValue.key;
        });
        params.sortOptionKey = $scope.sortValue.key;
        params.sortOption = sortOption;
        params.location_finder_way = $scope.location_finder_way;
        params.advanced_search_option = $scope.advanced_search;
        $window.localStorage.setItem("search_params", JSON.stringify(params));
        $scope.active_search = params;
      },function(error) {
        CRM.$('#crm-main-content-wrapper').unblock();
        if (error.is_error) {
          CRM.alert(error.error_message, ts("Error"), "error");
        } else {
          return error;
        }
      }); 
    }  
    // parse our filters into a usable set of options for the server
    const getFilterParams = () => {
      // this line will check if the argument is undefined, null, or false
      // if so set it to false, otherwise set it to it's original value
      // firstTime = firstTime || false;
      let params = {};
      // if($window.localStorage.getItem("search_params") && firstTime == true) {
        
      //   params = JSON.parse($window.localStorage.getItem("search_params"));
      //   params.page_no ? $scope.currentPage=params.page_no : null;
      //   params.search_appeal ? $scope.search=params.search_appeal : null;
      //   params.orderby ? $scope.order=params.orderby : null;
      //   params.order ? $scope.order=params.order : null;
      //   params.sortOption ? $scope.sortValue=$scope.options[params.sortOption] : 0;
      //   params.advanced_search_option ? $scope.advanced_search=params.advanced_search_option : false;

      //   if(params.advanced_search_option) {
      //     params.advanced_search.fromdate ? $scope.date_start=params.advanced_search.fromdate : null;
      //     params.advanced_search.todate ? $scope.date_end=params.advanced_search.todate : null;

      //     if(params.advanced_search.show_appeals_done_anywhere) {
      //       params.advanced_search.show_appeals_done_anywhere ? $scope.show_appeals_done_anywhere=params.advanced_search.show_appeals_done_anywhere : null;
      //     } else {
      //       if(params.advanced_search.proximity) {
      //         params.advanced_search.proximity.radius ? $scope.radius=params.advanced_search.proximity.radius : null;
      //         params.advanced_search.proximity.unit ? $scope.unit=params.advanced_search.proximity.unit : null;
      //       }
      //       params.location_finder_way ? $scope.location_finder_way=params.location_finder_way : null;
      //       if(params.location_finder_way == "use_postal_code") {
      //         params.advanced_search.proximity.postal_code ? $scope.postal_code=params.advanced_search.proximity.postal_code : null;
      //       }
      //       if(params.location_finder_way == "use_my_location") {
      //         params.advanced_search.proximity.lat ? $scope.lat=params.advanced_search.proximity.lat : null;
      //         params.advanced_search.proximity.lon ? $scope.lon=params.advanced_search.proximity.lon : null;
      //       }
      //     }
      //     params.advanced_search.appealCustomFieldData ? $scope.appealCustomFieldData=params.advanced_search.appealCustomFieldData : null;
      //   }
      // }
      // $scope.currentPage ? params.page_no=$scope.currentPage : null;
      // $scope.search ? params.search_appeal=$scope.search : null;
      // $scope.order ? params.orderby=$scope.order : null;
      // $scope.order ? params.order=$scope.order : null;

      // // Date and Location Search
      // if ($scope.advanced_search) {
        
      //   // Default Proximity Object Set to empty.
      //   params.advanced_search={proximity:{}};
        
      //   // Date Search
      //   $scope.date_start ? params.advanced_search.fromdate=$scope.date_start : null;
      //   $scope.date_end ? params.advanced_search.todate=$scope.date_end : null;
        
      //   // Proximity Search
      //   // If Show appeals done anywhere checkbox is disable then and then proximity set. 
      //   if(!$scope.show_appeals_done_anywhere) {
      //     $scope.radius?params.advanced_search.proximity.radius=$scope.radius:null;
      //     $scope.unit?params.advanced_search.proximity.unit=$scope.unit:null;
      //     if($scope.location_finder_way == "use_postal_code") {
      //       $scope.postal_code?params.advanced_search.proximity.postal_code=$scope.postal_code:null;
      //     } else {
      //       $scope.lat ? params.advanced_search.proximity.lat=$scope.lat : null;
      //       $scope.lon ? params.advanced_search.proximity.lon=$scope.lon : null;
      //     }
      //   }
      //   $scope.show_appeals_done_anywhere ? params.advanced_search.show_appeals_done_anywhere=$scope.show_appeals_done_anywhere : null;

      //   // Pass custom field data from advance search to API.
      //   params.advanced_search.appealCustomFieldData = $scope.appealCustomFieldData;
      // }
      
      // var current_parms = $route.current.params;
      // if (current_parms.beneficiary && typeof current_parms.beneficiary === "string") {
      //   params.beneficiary = current_parms.beneficiary;
      // }

      // if(params.beneficiary) {
      //   var beneficiaryArray = params.beneficiary.split(",");
      //   for(var i = 0; i < beneficiaryArray.length; i++) {
      //     CRM.api3('Contact', 'get', {
      //       "sequential": 1,
      //       "id": beneficiaryArray[i]
      //     }).then(function(result) {
      //       if(result && result.values.length > 0) {
      //         if(!!($scope.beneficiary_name.indexOf(result.values[0].display_name)+1) == false) {
      //           $scope.beneficiary_name.push(result.values[0].display_name);
      //         }
      //       }
      //     }, function(error) {
      //       // oops
      //       console.warn(error);
      //     });
      //   }
      // }

      // // Custom Data Search
      // if(params.advanced_search) {
      //   for (var key in params.advanced_search.appealCustomFieldData) {
      //     if (params.advanced_search.appealCustomFieldData.hasOwnProperty(key)) {
      //       var customFieldArray = key.split("_");
      //       CRM.api3('CustomField', 'get', {
      //         "sequential": 1,
      //         "id": customFieldArray[1]
      //       }).then(function(result) {
      //         var group_id = result.values[0].custom_group_id;
      //         CRM.api3('CustomGroup', 'get', {
      //           "sequential": 1,
      //           "id": group_id
      //         }).then(function(result) {
      //           if(!!($scope.custom_field_display.indexOf(result.values[0].title)+1) == false) {
      //             $scope.custom_field_display.push(result.values[0].title);
      //           }
      //         }, function(error) {
      //           // oops
      //         });
      //       }, function(error) {
      //         // oops
      //       });
      //     }
      //   }
      // }

      return params;
    }
    // get a list of appeals
    $scope.loadList = () => {
      
      $scope.appeals = [];
      
      const filterParams = getFilterParams();
      const params = $.extend({}, filterParams, {
        options: {
          offset: $scope.offset,
          limit: $scope.limit,
          sort: $scope.order + ' ' + $scope.dir,
        },
      });

      getAppeals(params)
      .then(appeals => {
        $scope.appeals = appeals;
      });
    }
    $scope.loadList();

    // https://tc39.github.io/ecma262/#sec-array.prototype.findIndex
    if (!Array.prototype.findIndex) {
      Object.defineProperty(Array.prototype, 'findIndex', {
        value: function(predicate) {
         // 1. Let O be ? ToObject(this value).
          if (this == null) {
            throw new TypeError('"this" is null or not defined');
          }

          var o = Object(this);

          // 2. Let len be ? ToLength(? Get(O, "length")).
          var len = o.length >>> 0;

          // 3. If IsCallable(predicate) is false, throw a TypeError exception.
          if (typeof predicate !== 'function') {
            throw new TypeError('predicate must be a function');
          }

          // 4. If thisArg was supplied, let T be thisArg; else let T be undefined.
          var thisArg = arguments[1];

          // 5. Let k be 0.
          var k = 0;

          // 6. Repeat, while k < len
          while (k < len) {
            // a. Let Pk be ! ToString(k).
            // b. Let kValue be ? Get(O, Pk).
            // c. Let testResult be ToBoolean(? Call(predicate, T, « kValue, k, O »)).
            // d. If testResult is true, return k.
            var kValue = o[k];
            if (predicate.call(thisArg, kValue, k, o)) {
              return k;
            }
            // e. Increase k by 1.
            k++;
          }

          // 7. Return -1.
          return -1;
        }
      });
    }

  });

})(angular, CRM.$, CRM._);
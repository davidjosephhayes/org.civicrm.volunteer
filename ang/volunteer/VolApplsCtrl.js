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
    
    // Assign supporting data values
    $scope.supporting_data = supporting_data.values;

    // Assign custom field set values
    $scope.custom_fieldset_volunteer = custom_fieldset_volunteer.values;
    // So this is an array when empty and key'd object when data is there
    // Object.keys can at least telss if we have something to work with
    // just gonna parse this out into a keys object of custom fields so I do no have to do it later
    const customGroupIds = Object.keys($scope.custom_fieldset_volunteer);
    const customFields = {};
    customGroupIds.forEach(customGroupId => {
      const fields = $scope.custom_fieldset_volunteer[customGroupId].appeal_custom_field_groups.fields;
      const customFieldNames = Object.keys(fields);
      if (customFieldNames.length === 0)
        return;
      customFieldNames.forEach(customFieldName => {
        const field = fields[customFieldName];
        // add field to our lookup list
        customFields[customFieldName] = field;
        // add a blank option at the beginning of select lists so they are clearable
        if (field.widget === "crm-render-select") {
          // should be a ref to origal object
          field.options.unshift({
            default: "",
            is_active: "1",
            label: "",
            name: "",
            order: "",
            postText: "",
            preText: "",
            price: "",
            required: "",
            value: "",
          });
        }
      });
    });

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
    };

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
    };

    /**
     *  filter variables
     */
    // default filter set
    const defaultFilters = {
      // text search
      search: '',
      // need dates
      date_start: '',
      date_end: '',
      // beneficiary search
      beneficiaries: [],
      // proximity search
      location_finder_way: '',
      postal_code: '',
      lat: '',
      lon: '',
      radius: 2,
      unit: 'miles',
      show_appeals_done_anywhere: false,
      // custom data
      custom_data: {},
    };
    // filters passed in url params -- possible XSFR, but seems AngularJS modal escapes properly; returns boolean false on failure
    const getParamsFilters = () => {
      if(!('filters' in $routeParams))
        return false;
      try {
        const paramsFilters = JSON.parse($routeParams.filters);
        return paramsFilters;
      } catch(e) {
        console.warn('Invalid param filters');
      }
      return false;
    };
    // filters saved in local storage; returns boolean false on failure
    const getLocalStorageFilters = () => {
      const savedFiltersJson = window.localStorage.getItem('civivolunteer_appeal_filters');
      if (savedFiltersJson === null)
        return false;
      try {
        const savedFilters = JSON.parse(savedFiltersJson);
        return savedFilters;
      } catch(e) {
        console.warn('Invalid local strage filters');
      }
      return false;
    };
    // now we can get our initial filters from the route or local storage with a preference for route and fallback to local storage
    let initialFilters = {};
    const paramsFilters = getParamsFilters();
    if (paramsFilters !== false) {
      initialFilters = paramsFilters;
    } else {
      const localstorageFilters = getLocalStorageFilters();
      if (localstorageFilters !== false)
        initialFilters = localstorageFilters;
    }
    // clone saved and default filter set to active filter object
    $scope.filters = $.extend(true, {}, defaultFilters, initialFilters);

    // save filters locally
    $scope.saveFilters = () => window.localStorage.setItem('civivolunteer_appeal_filters', JSON.stringify($scope.filters));
    $scope.saveFilters();
    // proximity vars
    $scope.proximityUnits = [
      {value: 'km', label: ts('km')},
      {value: 'miles', label: ts('miles')}
    ];
    $scope.radiusValues = [
      {value: 2, label: ts('2')},
      {value: 5, label: ts('5')},
      {value: 10, label: ts('10')},
      {value: 25, label: ts('25')},
      {value: 100, label: ts('100')}
    ];
    $scope.getPosition = () => {
      if(navigator.geolocation){
        navigator.geolocation.getCurrentPosition(position => {
          $scope.$apply(() => {
            // 5 decimal places is like 1 meter resolution, no reason for more; also want these to stay strings
            $scope.filters.lat = position.coords.latitude.toFixed(5);
            $scope.filters.lon = position.coords.longitude.toFixed(5);
          });  
        });
      } else {
        CRM.alert("Sorry, your browser does not support geolocation.", ts("Error"), "error");
      }
    }
    // Clear checkbox selection in Date and Location Filter.
    $scope.clearLocationFinder = () => {
      $scope.filters.radiusValue = defaultFilters.unit;
      $scope.filters.unit = defaultFilters.unit;
      $scope.filters.location_finder_way = defaultFilters.location_finder_way;
      $scope.filters.lat = defaultFilters.lat;
      $scope.filters.lon = defaultFilters.lon;
      $scope.filters.postal_code = defaultFilters.postal_code;
      // $scope.displayFilters();
    };
    // watch the only show opportunities anywhere value, clearning other fields as necessary
    $scope.$watch('filters.show_appeals_done_anywhere', () => {
      if (!$scope.filters.show_appeals_done_anywhere)
        return;
      $scope.clearLocationFinder();
    })
    // validate any filters
    $scope.validateFilters = () => {
      let success = true;
      // postal code
      if (
        $scope.filters.location_finder_way === 'use_postal_code' &&
        $scope.filters.postal_code.length === 0
      ) {
        success = false;
        CRM.alert(ts('Postal Code is required'), ts("Error"), "error");
      }
      // lat/lon
      if (
        $scope.filters.location_finder_way === 'use_my_location' && (
          $scope.filters.lat.length === 0 || $scope.filters.lon.length === 0
        )
      ) {
        success = false;
        CRM.alert(ts('Latitude and Longitude are required'), ts("Error"), "error");
      }
      // custom data
      const customFieldNames = Object.keys($scope.filters.custom_data);
      if (customFieldNames.length>0) {
        customFieldNames.forEach(customFieldName => {
          if (!(customFieldName in customFields)) {
            success = false;
            CRM.alert(ts('Unknown custom filter'), ts("Error"), "error");
            return;
          }
          // TODO: Only valid for some field types
          // const customField = customFields[customFieldName];
          // const selectedOption = customField.options.find(option => option.value === $scope.filters.custom_data[customFieldName]);
          // if (selectedOption === undefined) {
          //   success = false;
          //   CRM.alert(ts('Unknown custom filter value'), ts("Error"), "error");
          //   return;
          // }
        })
      }
      return success;
    };
    // trigger filter
    $scope.applyFilters = () => {
      if (!$scope.validateFilters())
        return;
      $scope.saveFilters(); // save the filters
      if ('filters' in $routeParams) {
        // reset the url so a refresh doesn't overwrite newly saved filters
        $location.search('filters', null); 
        return;
      }
      // reset and load our list
      $scope.offset = 0;
      $scope.loadList();
      $scope.displayFilters();
      $scope.closeModal('crm-vol-advanced-filters');
    }
    // clear filters
    $scope.resetFilters = () => {
      $scope.filters = $.extend(true, {}, defaultFilters);
      $scope.applyFilters();
    }
    // remove a custom filter
    $scope.removeCustomFilter = customFieldName => {
      if (!(customFieldName in $scope.filters.custom_data)) {
        CRM.alert(ts('Unknown custom filter'), ts("Error"), "error");
        return false;
      }
      delete $scope.filters.custom_data[customFieldName];
      return true;
    };
    // parse filters into a display
    $scope.filterDisplay = [];
    $scope.displayFilters = () => {
      // Reset Filter display
      $scope.filterDisplay = [];
      // Date Filters
      if ($scope.filters.date_start!=='' || $scope.filters.date_end!=='') {
        let label = '';
        if ($scope.filters.date_start!=='' && $scope.filters.date_end!=='') {
          label = 'Between ' + $scope.filters.date_start + ' and ' + $scope.filters.date_end;
        } else if ($scope.filters.date_start!=='') {
          label = 'On or after ' + $scope.filters.date_start;
        } else {
          label = 'On or before ' + $scope.filters.date_end;
        }
        $scope.filterDisplay.push({
          label: label,
          remove: () => {
            $scope.filters.date_start = defaultFilters.date_start;
            $scope.filters.date_end = defaultFilters.date_start;
            $scope.applyFilters();
          },
        });
      }
      // Proximity Filters
      if ($scope.filters.show_appeals_done_anywhere) {
        $scope.filterDisplay.push({
          label: 'Only Opportunities that can be done from anywhere',
          remove: () => {
            $scope.filters.show_appeals_done_anywhere = defaultFilters.show_appeals_done_anywhere;
            $scope.applyFilters();
          },
        });
      } else if (['use_postal_code','use_my_location'].includes($scope.filters.location_finder_way)) {
        const proximityUnit = $scope.proximityUnits.find(v => v.value === $scope.filters.unit);
        const radiusValue = $scope.radiusValues.find(v => v.value === $scope.filters.radius);
        if (proximityUnit !== undefined && radiusValue !== undefined) {
          if (
            $scope.filters.location_finder_way === 'use_postal_code' &&
            $scope.filters.postal_code.length>0
          ) {
            $scope.filterDisplay.push({
              label: 'Within ' + radiusValue.label + ' ' + proximityUnit.label + ' of ' + $scope.filters.postal_code,
              remove: () => {
                $scope.clearLocationFinder();
                $scope.applyFilters();
              },
            });
          } else if (
            $scope.filters.location_finder_way === 'use_my_location' &&
            $scope.filters.lat.length>0 &&
            $scope.filters.lon.length>0
          ) {
            $scope.filterDisplay.push({
              label: 'Within ' + radiusValue.label + ' ' + proximityUnit.label + ' of ' + $scope.filters.lat + ', ' + $scope.filters.lon,
              remove: () => {
                $scope.clearLocationFinder();
                $scope.applyFilters();
              },
            });
          }
        }
      }
      // Beneficiary Search
      if ($scope.filters.beneficiaries.length>0) {
        // TODO
      }
      // Custom Data Search
      const customFieldNames = Object.keys($scope.filters.custom_data);
      if (customFieldNames.length>0) {
        customFieldNames.forEach(customFieldName => {
          if (!(customFieldName in customFields)) // should be taken care of by our validator, but dummy check
            return;
          const customField = customFields[customFieldName];
          const customFieldValue = $scope.filters.custom_data[customFieldName];
          if (customFieldValue !==null && customFieldValue !== '') {
            let label = '';
            if (customField.options.length>0) {
              const selectedOption = customField.options.find(option => option.value === customFieldValue);
              const displayValue = selectedOption === undefined ? customFieldValue : selectedOption.label;
              label = customField.label + ' is "' + displayValue + '"';
            } else {
              const displayValue = customFieldValue;
              label = customField.label + ' contains "' + displayValue + '"';
            }
            $scope.filterDisplay.push({
              label: label,
              remove: () => {
                $scope.removeCustomFilter(customFieldName);
                $scope.applyFilters();
              },
            });
          }
        });
      }
    };
    $scope.displayFilters();
    
    /**
     * Data load
     */
    // list of appeals
    $scope.sourceAppeals = [];
    // method to get list from server and do basic processing, returns promise
    const getAppeals = (params, method) => {
      
      $scope.loading = true;
      CRM.$('#crm-main-content-wrapper').block();

      method = method || 'getsearchresult';
      if (!('sequential' in params))
        params['sequential'] = 1;

      return crmApi('VolunteerAppeal', method, params)
      .then(function (data) {

        $scope.sourceAppeals = data.values;
        $scope.totalRec = data.total;
        $scope.calcCurrentPage();
        $scope.calcTotalPages();
        
        const appeals = data.values.map(appeal => {
          appeal.hide_appeal_volunteer_button = parseInt(appeal.hide_appeal_volunteer_button);
          appeal.hide_appeal_volunteer_button = parseInt(appeal.display_volunteer_shift);
          return appeal;
        });
                  
        $scope.loading = false;
        CRM.$('#crm-main-content-wrapper').unblock();

        return appeals;
      })
      .catch(error => {
        CRM.alert(error.is_error ? error.error_message : error, ts("Error"), "error");
        $scope.loading = false;
        CRM.$('#crm-main-content-wrapper').unblock();
      });
    }  
    // parse our filters into a usable set of options for the server
    const getFilterParams = () => {

      const params = {};

      // text search
      if ($scope.filters.search.length>0)
        params.search = $scope.filters.search;

      // date search
      if ($scope.filters.date_start.length>0)
        params.fromdate = $scope.filters.date_start;
      if ($scope.filters.date_end.length>0)
        params.todate = $scope.filters.date_end;

      // beneficiaries search
      if ($scope.filters.beneficiaries.length>0)
        params.beneficiaries = $scope.filters.beneficiaries;

      // proximity search
      if ($scope.filters.show_appeals_done_anywhere) {
        
        params.show_appeals_done_anywhere = $scope.filters.show_appeals_done_anywhere;

      } else if (['use_postal_code','use_my_location'].includes($scope.filters.location_finder_way)) {
        // postal code search
        if (
          $scope.filters.location_finder_way === 'use_postal_code' &&
          $scope.filters.postal_code.length>0
        ) {
          params.proximity = {
            unit: $scope.filters.unit,
            radius: $scope.filters.radius,
            postal_code: $scope.filters.postal_code,
          };
        }
        // lat / lon search
        if (
          $scope.filters.location_finder_way === 'use_my_location' &&
          $scope.filters.lat.length>0 &&
          $scope.filters.lon.length>0
        ) {
          params.proximity = {
            unit: $scope.filters.unit,
            radius: $scope.filters.radius,
            lat: $scope.filters.lat,
            lon: $scope.filters.lon,
          };
        }

      }
      
      // custom data search, filter out empty values
      const customFieldNames = Object.keys($scope.filters.custom_data);
      if (customFieldNames.length>0) {
        params.custom_data = {};
        customFieldNames.forEach(customFieldName => {
          if ($scope.filters.custom_data[customFieldName].length === 0)
            return;
          params.custom_data[customFieldName] = $scope.filters.custom_data[customFieldName];
        });
        if (Object.keys(params.custom_data).length===0)
          delete params.custom_data;
      }

      return params;
    }
    // get a list of appeals
    $scope.appeals = [];
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
((angular, $, _) => {

  angular.module('volunteer').config($routeProvider => {
    $routeProvider.when('/volunteer/assignments/:view?', {
      controller: 'Assignments',
      // update the search params in the URL without reloading the route     
      templateUrl: '~/volunteer/Assignments.html',
      resolve: {
      },
    });
  });

  angular.module('volunteer').controller('Assignments', function(
    $route, $routeParams, $scope, crmApi, $window, $location, 
    volunteerCalendarConfig, volunteerModalService
  ){

    var ts = $scope.ts = CRM.ts('org.civicrm.volunteer');
    
    $scope.loading = false;
    $scope.search = "";
    $scope.totalRec = 0;
    // only used for list view
    $scope.assignments = [];
    $scope.offset = 0;
    $scope.limit = 10;
    $scope.order = 'start_time';
    $scope.dir = 'desc';
    $scope.calcCurrentPage = () => $scope.currentPage = Math.floor($scope.offset / $scope.limit) + 1;
    $scope.calcTotalPages = () => $scope.totalPages = $scope.totalRec === 0 ? 1 : Math.ceil($scope.totalRec / $scope.limit);
    $scope.currentPage = 1;
    $scope.totalPages = 1;

    //Change reult view
    $scope.changeView=  view => {
      view = view || 'list';
      $location.path("/volunteer/assignments/" + view);
    };

    // Check what view we are using
    let view = $routeParams.view;
    if (!view || !['calendar', 'list'].includes(view)) {
      $scope.changeView('list');
      return;
    }

    // setup our view
    $scope.view = view;
    $scope.template = "~/volunteer/Assignments" + view.charAt(0).toUpperCase() + view.slice(1).toLowerCase() + ".html";

    // Go to Profile Page
    $scope.goToProfile = () => $window.location.href = CRM.url('civicrm/volunteer/profile');

    //reset page count and search data
    $scope.resetSearch = () => {
      $scope.search = "";
      $scope.offset = 0;
      $scope.searchRes();
    };
    $scope.searchRes = () => {
      $scope.offset = 0;
      if (view==='calendar')
        volunteerCalendarConfig.calendars.assignments.fullCalendar('refetchEvents');
      if (view==='list')
        $scope.loadList();
    }

    // modal window setup
    $scope.currentAssignment = null;
    $scope.currentAssignmentStatus = '';
    $scope.openModal = id => volunteerModalService.open(id);
    $scope.closeModal = id => volunteerModalService.close(id);

    // just keeping track of what the api returned
    $scope.sourceAssignments = [];

    // get assignments
    const getAssignments = (params, method) => {

      $scope.loading = true;
      CRM.$('#crm-main-content-wrapper').block();

      method = method || 'getsearchresult';
      if (!('sequential' in params))
        params['sequential'] = 1;
      if (!('assignee_contact_id' in params))
        params['assignee_contact_id'] = CRM.vars['org.civicrm.volunteer'].currentContactId;

      return crmApi('VolunteerNeed', method, params)
      .then(data => {

        $scope.sourceAssignments = data.values;
        $scope.totalRec = data.total;
        $scope.calcCurrentPage();
        $scope.calcTotalPages();

        const assignments = data.values
        .map(assignment => {
          // add if in past
          const now = moment();
          const start = moment(assignment.start_time);
          assignment.status = 'registered';
          if (start.isBefore(now))
            assignment.status = 'completed';
          // add schedule type into object
          assignment.schedule_type = 'unknown';
          if (assignment.start_time) {
            if (assignment.duration === '' || assignment.duration < 1) {
              assignment.schedule_type = 'open';
            } else if (!assignment.end_time) {
              assignment.schedule_type = 'shift';
            } else {
              assignment.schedule_type = 'flexible';
            }
          } else {
            console.warn('Assignment ' + assignment.id + ' has invalid times'); 
          }
          return assignment;
        });

        $scope.loading = false;
        CRM.$('#crm-main-content-wrapper').unblock();

        return assignments;
      })
      .catch(error => {
        CRM.alert(error.is_error ? error.error_message : error, ts("Error"), "error");
        $scope.loading = false;
        CRM.$('#crm-main-content-wrapper').unblock();
      });
    };

    if (view === 'list') {

      $scope.changeSort = col => {
        if (col === $scope.order) {
          $scope.dir = $scope.dir === 'asc' ? 'desc' : 'asc';
        } else {
          $scope.order = col;
        }
        $scope.loadList();
      };

      $scope.changePage = direction => {
        let nextOffset = $scope.offset + direction * $scope.limit;
        if (nextOffset<0 && $scope.offset === 0) {
          CRM.alert('This is the first page', ts("Error"), "error");
          return;
        }
        if (nextOffset>=$scope.totalRec) {
          CRM.alert('This is the last page', ts("Error"), "error");
          return;
        }
        $scope.offset = nextOffset;
        $scope.loadList();
      }
      
      $scope.loadList = () => {
        
        $scope.assignments = [];
        
        const params = {
          options: {
            offset: $scope.offset,
            limit: $scope.limit,
            sort: $scope.order + ' ' + $scope.dir,
          },
        };

        if ($scope.search)
          params.search = $scope.search;

        getAssignments(params)
        .then(assignments => {
          $scope.assignments = assignments;
        });
      }

      $scope.rowClick = assignment => {
        $scope.currentAssignment = assignment;
        $scope.openModal('crm-vol-assignment-info');
      };

      $scope.loadList();
    }

    if (view === 'calendar') {
      // config object for calendar
      $scope.uiConfig = {
        calendar:{
          height: 750,
          header:{
            left: 'month agendaWeek agendaDay', //  basicWeek basicDay 
            center: 'title',
            right: 'today prev,next'
          },
          eventClick: (calEvent, jsEvent, view) => {
            $scope.currentAssignment = calEvent.assignment;
            $scope.openModal('crm-vol-assignment-info');
          },
          viewRender: currentView => {
            const minDate = moment();
            // maxDate = moment().add(2,'weeks');
            // Past
            if (minDate >= currentView.start && minDate <= currentView.end) {
              $(".fc-prev-button").prop('disabled', true); 
              $(".fc-prev-button").addClass('fc-state-disabled'); 
            } else {
              $(".fc-prev-button").removeClass('fc-state-disabled'); 
              $(".fc-prev-button").prop('disabled', false); 
            }
            // // Future
            // if (maxDate >= currentView.start && maxDate <= currentView.end) {
            //   $(".fc-next-button").prop('disabled', true); 
            //   $(".fc-next-button").addClass('fc-state-disabled'); 
            // } else {
            //   $(".fc-next-button").removeClass('fc-state-disabled'); 
            //   $(".fc-next-button").prop('disabled', false); 
            // }
          },
        },
      };
      // calendar setup
      $scope.calendarSources = [];
      $scope.calendarEvents = [
        (start, end, timezone, callback) => {

          const params = {
            date_start: start.format("YYYY-MM-DD HH:mm:ss"),
            date_end: end.format("YYYY-MM-DD HH:mm:ss"),
            options: {
              limit: 0,
            },
          };

          if ($scope.search)
            params.search = $scope.search;

          getAssignments(params)
          .then(function(assignments){

            const events = assignments
            // time / quantity constraints
            .filter(assignment => (
              // supported schedule types
              (assignment.schedule_type === 'shift' || assignment.schedule_type === 'flexible')
            ))
            .map(assignment => {
              const start = moment(assignment.start_time);
              const classNames = ['fc-registered'];
              if (assignment.status==='completed')
                classNames.push('fc-completed');
              const eventSource = {
                id: assignment.id,
                title: assignment.role_label.trim() + ' - ' + assignment.project.title.trim(),
                start: start,
                className: classNames.join(' '),
                assignment: assignment,
              };
              if (assignment.end_time) {
                eventSource.end = moment(assignment.end_time);
              } else if (assignment.duration) {
                eventSource.end = start.clone().add(assignment.duration, 'minute');
              } else {
                // shouldn't get here
                console.warn('Assignment ' + assignment.id + ' has invalid times'); 
              }
              return eventSource;
            });

            $scope.totalRec = events.length;
            callback(events);
          });
        },
      ];
    }

  });

})(angular, CRM.$, CRM._);
(function (angular, $, _) {

  angular.module('volunteer').config(function ($routeProvider) {
    $routeProvider.when('/volunteer/assignments/:view?', {
      controller: 'Assignments',
      // update the search params in the URL without reloading the route     
      templateUrl: '~/volunteer/Assignments.html',
      resolve: {
      },
    });
  });

  angular.module('volunteer').controller('Assignments', function ($route, $routeParams, $scope, crmApi, $window, $location, volunteerCalendarConfig, volunteerModalService) {

    var ts = $scope.ts = CRM.ts('org.civicrm.volunteer');
    
    $scope.search = "";
    $scope.totalRec;

    //Change reult view
    $scope.changeView=function(view) {
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

    //reset page count and search data
    $scope.resetSearch = function(){
      $scope.search = "";
      $scope.searchRes();
    };
    $scope.searchRes = function(){
      volunteerCalendarConfig.calendars.assignments.fullCalendar('refetchEvents');
    };

    // modal window setup
    $scope.currentEvent = null;
    $scope.currentEventStatus = '';
    $scope.openModal = function(id) {
      volunteerModalService.open(id);
    };
    $scope.closeModal = function(id) {
      volunteerModalService.close(id);
    };

    $scope.sourceAssignments = [];

    // get assignments
    let getAssignments = function(params, method) {

      CRM.$('#crm-main-content-wrapper').block();

      method = method || 'get';
      if (!('sequential' in params))
        params['sequential'] = 1;
      if (!('api.VolunteerNeed.getsingle' in params))
        params['api.VolunteerNeed.getsingle'] = 1;
      params['target_contact_id'] = CRM.vars['org.civicrm.volunteer'].currentContactId;

      return new Promise((resolve, reject) => {
        crmApi('VolunteerAssignment', method, params)
        .then(data => {

          if (method === 'getcount')
            resolve(data.result);

          return data.values
          .map(assignment => {
            // copy data from need just in case it was updated
            assignment.need = assignment['api.VolunteerNeed.getsingle'];
            delete assignment['api.VolunteerNeed.getsingle'];
            assignment.project_id = assignment.need.project_id;
            assignment.start_time = assignment.need.start_time;
            assignment.end_time = assignment.need.end_time;
            assignment.duration = assignment.need.duration;
            assignment.display_time = assignment.need.display_time;
            assignment.role_label = assignment.need.role_label;
            assignment.role_description = assignment.need.role_description;
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

        })
        .then(assignments => {
          if (assignments.length<1) {
            CRM.$('#crm-main-content-wrapper').unblock();
            resolve(assignments);
            return;
          }
          const project_ids = assignments.map(assignment => assignment.project_id);
          crmApi('VolunteerProject', 'get', {
            id: {'IN': project_ids},
          })
          .then(data => {
            return assignments.map(assignment => {
              assignment.project = assignment.project_id in data.values ? data.values[assignment.project_id] : null;
              return assignment
            });
          })
          .then(assignments => {
            $scope.sourceAssignments = assignments;
            CRM.$('#crm-main-content-wrapper').unblock();
            resolve(assignments)
          })
          .catch(error => {
            CRM.alert(error.is_error ? error.error_message : error, ts("Error"), "error");
            CRM.$('#crm-main-content-wrapper').unblock();
            reject();
          });
        })
        .catch(error => {
          CRM.alert(error.is_error ? error.error_message : error, ts("Error"), "error");
          CRM.$('#crm-main-content-wrapper').unblock();
          reject();
        });
      });
    };

    if (view === 'list') {

      const params = {
        // date_start: start.format("YYYY-MM-DD HH:mm:ss"),
        // date_end: end.format("YYYY-MM-DD HH:mm:ss"),
        options: {
          limit: 0,
        },
      };

      if ($scope.search)
        params.search = $scope.search;

      getAssignments(params)

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
          eventClick: function(calEvent, jsEvent, view) {
            $scope.currentEvent = calEvent;
            $scope.currentEventStatus = 'registered';
            if (calEvent.className.includes('fc-completed'))
              $scope.currentEventStatus = 'completed';
            $scope.openModal('crm-vol-assignment-info');
          },
          viewRender: function(currentView){
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
        function(start, end, timezone, callback) {

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
            .filter(function(assignment){
              return (
                // supported schedule types
                (assignment.schedule_type === 'shift' || assignment.schedule_type === 'flexible')
              );
            })
            .map(function(assignment){
              const now = moment();
              const start = moment(assignment.start_time);
              const classNames = ['fc-registered'];
              if (start.isBefore(now))
                classNames.push('fc-completed');
              const eventSource = {
                id: assignment.id,
                title: assignment.role_label.trim() + ' - ' + assignment.subject.trim(),
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
'use strict';

angular.module('deckApp.delivery.executions.service', [
  'ui.router',
  'deckApp.scheduler',
  'deckApp.orchestratedItem.service',
  'deckApp.settings',
  'deckApp.utils.rx',
  'deckApp.utils.appendTransform',
  'deckApp.delivery.executionTransformer.service'
])
  .factory('executionsService', function($stateParams, $http, $timeout, $q, scheduler, orchestratedItem, settings, RxService, appendTransform, executionsTransformer) {

    function getExecutions(applicationName) {
      var deferred = $q.defer();
      $http({
        method: 'GET',
        transformResponse: appendTransform(function(executions) {
          if (!executions || !executions.length) {
            return [];
          }
          executions.forEach(executionsTransformer.transformExecution);
          return executions;
        }),
        url: [
          settings.gateUrl,
          'applications',
          applicationName,
          'pipelines',
        ].join('/'),
      }).then(
        function(resp) {
          deferred.resolve(resp.data);
        },
        function(resp) {
          deferred.reject(resp);
        }
      );
      return deferred.promise;
    }

    function waitUntilNewTriggeredPipelineAppears(application, pipelineName, ignoreList) {

      return application.reloadExecutions().then(function() {
        var executions = application.executions;
        var match = executions.filter(function(execution) {
          return (execution.status === 'RUNNING' || execution.status === 'NOT_STARTED') &&
            execution.name === pipelineName &&
            ignoreList.indexOf(execution.id) === -1;
        });
        var deferred = $q.defer();
        if (match && match.length) {
          deferred.resolve();
          return deferred.promise;
        } else {
          return $timeout(function() {
            return waitUntilNewTriggeredPipelineAppears(application, pipelineName, ignoreList);
          }, 1000);
        }
      });
    }

    function cancelExecution(executionId) {
      var deferred = $q.defer();
      $http({
        method: 'PUT',
        url: [
          settings.gateUrl,
          'applications',
          $stateParams.application,
          'pipelines',
          executionId,
          'cancel',
        ].join('/')
      }).then(
          function() {
            scheduler.scheduleImmediate();
            deferred.resolve();
          },
          function(exception) {
            deferred.reject(exception.message);
          }
        );
      return deferred.promise;
    }

    return {
      getAll: getExecutions,
      cancelExecution: cancelExecution,
      forceRefresh: scheduler.scheduleImmediate,
      subscribeAll: function(fn) {
        return scheduler
          .get()
          .flatMap(function() {
            return RxService.Observable.fromPromise(getExecutions($stateParams.application));
          })
          .subscribe(fn);
      },
      waitUntilNewTriggeredPipelineAppears: waitUntilNewTriggeredPipelineAppears,
    };
  });

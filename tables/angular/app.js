/** 
 * @file Angular table initializes with seed data and updates via WebSocket server
 * @author koberoi@mac.com
 * @version 0.1
 * 
*/

/**
 * 
 * Number of rows in the table. Aligns with randomuser.me limit
 * @const {number}
 */
const MAXROWS = 5000

/**
 * Refresh rate (ms). Artificial limit.
 * @const {number}
 */
const MAXREFRESHTIME = 60000

/**
 * DataSize # of rows in the table (can be overriden by query param)
 * @type {number}
 * @default 1000
 */
let dataSize = 1000 

/**
 * Frequency (ms) in updating the page (can be overriden by query param)
 * @type {number}
 * @default 1000
 */
let updatePageTimeMS = 1000 

const conn = new WebSocket(webSocketURL) 

/**
 * State variable to indicate model has been seeded
 * @type {boolean}
 * @default false
 */
let modelReady = false

/**
 * File used to seed table if dataSize === 100
 * @const {string}
 */
const dataFile100 = 'data100.json'

/**
 * File used to seed model if dataSize = 1000
 * @const {string}
 */
const dataFile1k = 'data1k.json'

/**
 * Service used for 1-MAXROWS, outside 100 or 1000
 * @const {string}
 */
const randomUserNameURL = 'https://randomuser.me/api/?inc=name' 

/**
 * Sets file dataFile1K as default
 * @type {string}
 * @default dataFile1k
 */
let dataURL = dataFile1k  

/**
 * Tracks whether using file (e.g. 100,1000) vs API for seed data
 * @type {boolean}
 * @default true
 */
let dataFile = true 

/**
 * 
 * sort parameter used on initial seeding and updates (option a)
 * @const {string}
 */
const sort = '-value' 

/**
 * Defines whether sort should not be done after initial seeding
 * @type {boolean}
 * @default true
 */
let noSort = true

/**
 * Check query paramters to override defaults
 */
let queryParams = new URLSearchParams(document.location.search.substring(1))

if (queryParams != null) {
    
    /**
     * data - override default # of rows in the table
     */
    if (queryParams.get("data") != null) {
        let dataValue = parseInt(queryParams.get("data"))
        if (dataValue > 0 && dataValue <= MAXROWS) {
            dataSize = dataValue
            console.log(`dataSize overridden = ${dataSize}`)
          
            switch(dataSize) {
                case 100:
                    dataURL = dataFile100
                    break;
                case 1000:
                    dataURL = dataFile1k
                    break;
                default:
                    dataURL = randomUserNameURL + `&results=${dataSize}`
                    dataFile = false
            }
        }
    }

    /**
     * refresh - overrides frequency of page update (1.5ms)
     */
    if (queryParams.get("refresh") != null) {
        let refreshValue = parseInt(queryParams.get("refresh"))
        if (refreshValue >= 0 && refreshValue <= 60000) {
            updatePageTimeMS = refreshValue
            console.log(`updatePageTimeMS overridden = ${updatePageTimeMS}`)
        }
    } 

    /**
     * sort - overrides whether sort should be done after every update
     */
    if (queryParams.get("sort") != null) {
        let sortValue = queryParams.get("sort")
        if (sortValue === 'yes') {
            noSort = false // sort on updates
        }
    } 
}

/**
 * If sorting, kick off interval to call updatePage
 */
if (!noSort) {
    window.setInterval(updatePage, updatePageTimeMS)
}

/**
 * See the table with the initial model
 */
angular.module('AngularTable', []).controller('Main', function ($scope, $http, $filter) {
    $http({
        method: "GET",
        url: dataURL
    }).then(function mySuccess(response) {
        if (dataFile) {
            $scope.rows = response.data
        } else {
            let numItems = response.data.results.length
            $scope.rows = []
            for (let i = 0; i < numItems; i++) {
                $scope.rows[i] = {
                    "id" : i,
                    "value" : i,
                    "name" : `${response.data.results[i].name.first} ${response.data.results[i].name.last}`
                }
            }
        }
        $scope.rows = $filter('orderBy')($scope.rows, sort)
        modelReady = true
        conn.send('init') 
    }, function myError(response) {
        console.error(`Error: ${response.statusText}`)
        /**
         * @todo retry logic if file or API doesn't work the first time
         */
    });
});

/**
 * WebSocket callback when connection is open
 */
conn.onopen = () => {
    if (!modelReady) {
        conn.send('not ready')
    }
}

/**
 * WebSocket callback when error occurs
 */
conn.onerror = error => {
    console.error(`[oneerror] Websocket error: ${error}`)
}

/**
 * WebSocket callback when a message is received
 * Gets a single row update from Websocket server and
 * updates the table
 */
conn.onmessage = e => {
    let obj = JSON.parse(e.data)
    let myScope = angular.element(document.body).scope()

    const index = parseInt(obj.id)

    /**
     * Only update model if client has the row
     */
    if (myScope.rows != null && myScope.rows.length > index) {

        /**
         * Deep copy to replace row so table watcher picks up change
         * HTML notation disables row watchers for perf improvement
         */
        let newRow = angular.copy(myScope.rows[index])
        newRow.value = obj.value
        newRow.name = obj.name
        myScope.rows[index] = newRow

        if (noSort) {
            // if not sorting on update via updatePage(), then update the page immediately
            myScope.$digest()
        }
    } else {
        /**
         * It's bad to ignore a message and not respond with an error message
         * @todo client to tell server # of items it can modify (e.g. override NUM_ITEMS value in server.js)
         * @todo client to tell server there was an error processing the message
         */

        console.log("[onmessage] Ignoring message from server- server sending data client is not showing")
    }
}

/**
 * When sorting after update, update page from model
 */
function updatePage() {
    let myScope = angular.element(document.body).scope()
    let myFilter = angular.injector(['ng']).get('$filter')('orderBy')
    myScope.rows = myFilter(myScope.rows, sort)
    myScope.$digest()
}

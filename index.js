var http = require('http');
var iconv = require('iconv-lite');
var express = require('express');

var app = express();
var srv = http.createServer(app);
var io = require('socket.io')(srv);

var libxmljs = require('libxmljs');
var port = process.env.PORT || 3000;
var pad = function(n) { return ('00' + n).slice(-2); };

srv.listen(port, function() {
    console.log('Server listening at port %d', port);
});

app.use(express.static(__dirname + '/public'));
app.use('/angular', express.static(__dirname + '/node_modules/angular'));
app.use('/angular-animate', express.static(__dirname + '/node_modules/angular-animate'));
app.use('/roboto-fontface', express.static(__dirname + '/node_modules/roboto-fontface'));
app.use('/html5-marquee', express.static(__dirname + '/node_modules/html5-marquee/css'));
app.use('/font-awesome', express.static(__dirname + '/node_modules/font-awesome'));
app.use('/normalize', express.static(__dirname + '/node_modules/normalize.css'));

io.on('connection', function(socket){
    socket.on('chat message', function(msg){
	io.emit('chat message', msg);
    });
});

// error message in case ding servers a down:
var errormsg = {
    line: '&nbsp;',
    direction: 'DING Server not reachable',
    countdown: '&nbsp;',
    timetable: '&nbsp;',
    realtime: '0'
};

var id = 1240;

var options = {
    host: 'www.ding.eu',
    path: '/ding2/XML_DM_REQUEST?laguage=de&typeInfo_dm=stopID&nameInfo_dm=900'
	+ id + '&deleteAssignedStops_dm=1&useRealtime=1&mode=direct'
};

var callback = function(response) {
    var data = '';

    response.on('data', function(chunk) {
	data += iconv.decode(chunk, 'latin1');
    });

    response.on('end', function() {
	var xml = libxmljs.parseXmlString(data);

	var info = {};
	info.stopid = id;
	info.stopname = xml.get('/itdRequest/itdDepartureMonitorRequest/itdOdv/itdOdvName/odvNameElem').text();
	info.stopplace = xml.get('/itdRequest/itdDepartureMonitorRequest/itdOdv/itdOdvPlace/odvPlaceElem').text();
	info.timestamp = pad(xml.get('/itdRequest/itdDepartureMonitorRequest/itdDateTime/itdTime/@hour').value())
	    + ':' + pad(xml.get('/itdRequest/itdDepartureMonitorRequest/itdDateTime/itdTime/@minute').value());

	var departures = [];

	var dep = xml.get('/itdRequest/itdDepartureMonitorRequest/itdDepartureList/itdDeparture');
	while (dep != null) {
	    var tmp = {};

	    if (dep.get('./itdRTDateTime/itdTime')) {
		tmp.timetable = pad(dep.get('./itdRTDateTime/itdTime/@hour').value())
		    + ':' + pad(dep.get('./itdRTDateTime/itdTime/@minute').value());
	    } else {
		tmp.timetable = pad(dep.get('./itdDateTime/itdTime/@hour').value())
		    + ':' + pad(dep.get('./itdDateTime/itdTime/@minute').value());
	    }

	    tmp.line = dep.get('./itdServingLine/@number').value();
	    tmp.direction = dep.get('./itdServingLine/@direction').value();
	    tmp.realtime = dep.get('./itdServingLine/@realtime').value();
	    tmp.key = dep.get('./itdServingLine/@key').value();
	    tmp.countdown = dep.get('./@countdown').value();
	    tmp.platform = dep.get('./@platform').value();

	    if (dep.get('./itdServingLine/itdNoTrain/@delay'))
		tmp.delay = dep.get('./itdServingLine/itdNoTrain/@delay').value();

	    departures.push(tmp);
	    dep = dep.nextElement();
	}

	if (departures.length == 0) {
	    departures.push({
		line: '&nbsp;',
		direction: 'no Departures found',
		countdown: '&nbsp;',
		timetable: '&nbsp;',
		realtime: '0'
	    });
	}

	departures.sort(function(a, b) {
	    return parseInt(a.countdown) - parseInt(b.countdown);
	});

	io.emit('departures', {
	    info: info,
	    departures: departures
	});
    });
};

var disruptionOptions = {
    host: 'www.swu.de',
    path: '/index.php?id=5429&type=61312'
};

var disruptionCallback = function(response) {
    var data = '';

    response.on('data', function(chunk) {
	data += chunk;
    });

    response.on('end', function() {
	var xml = libxmljs.parseXmlString(data);

	var notice = '';

	if (xml.get('/root/teaseritem/teaser'))
	    notice = xml.get('/root/teaseritem/teaser').text();

	io.emit('disruption', notice);
    });
};


setInterval(function() {
    http.request(options, callback).end();
}, 5000);

setInterval(function() {
    http.request(disruptionOptions, disruptionCallback).end();
}, 15000);

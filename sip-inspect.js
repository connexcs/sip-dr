const rfc3261bnf = require('./rfc3261.bnf.json');

const Msg = require('./msg/core');
const sip_parsing = require('sip-parsing');
const { Compiler } = require('bnf');
const request = {
	INVITE: require('./msg/invite'),
	BYE: require('./msg/bye'),
	REGISTER: require('./msg/register'),
	// INFO: Msg,
	// SUBSCRIBE: Msg,
	OPTIONS: require('./msg/options'),
	// MESSAGE: Msg,
	// NOTIFY: Msg,
	CANCEL: require('./msg/cancel'),
	// UPDATE: Msg,
	// PRACK: Msg,
	ACK: require('./msg/ack')
	// REFER: Msg,
	// PUBLISH: Msg
}
const reply = {
	100: require('./msg/100')
}

let compiler = new Compiler();
//compiler.AddLanguage( rfc3261bnf, 'rfc3261bnf' );

compiler.SetRuleEvents({
	evaluation( token ){
//		console.log( "evaluation token found answer:", eval( token.value ) );
	}
});

//sip-parsing
module.exports = class SipInspectCore {
	constructor (app){
		// super(app);
		this.head = null;
		this.list = [];
		this.logs = [];
	}
	
	loadMessage (sip, layer4) {
		messages.push({sip, layer4})
	}

	loadMessages (msg) {
		messages.push(msg)
	}
	
	inspect () {
		
	}
	
	syntaxCheck () {
//		compiler.ParseScript(this.list[0].sip.str);
	}
	
	checks () {
		return this.list.map(msg => {
			msg.checks()
			var label = `${msg.meta.srcHost} -> ${msg.meta.dstHost} : ${msg.sip.first_line}`;
			if (msg.isRetransmission()) return;
			console.group(label);
			msg.facts.forEach(fact => {
				console.log(fact);
			});
			console.groupEnd();
		});
	}
	
	parseConnexCSTrace (rows) {
		var current = null;
		var idx = 0;
		for (const row of rows) {
			let sip = sip_parsing.parse(row.msg);
			let msg = null;
			if (Object.keys(request).includes(sip.$rm)){
				msg = new request[sip.$rm](sip, current, {unix: row.micro_ts / 1000, srcHost: row.source_ip, srcPort: row.source_port, dstHost: row.destination_ip, dstPost: row.destination_port, idx: idx++});
//			} else if (replyParts && Object.keys(reply).includes(replyParts[1])) {
//				msg = new reply[replyParts[1]](sip, current, {unix: row.micro_ts / 1000, srcHost: row.source_ip, srcPort: row.source_port, dstHost: row.destination_ip, dstPost: row.destination_port, idx: idx++});
			} else {
				msg = new Msg(sip, current, {unix: row.micro_ts / 1000, srcHost: row.source_ip, srcPort: row.source_port, dstHost: row.destination_ip, dstPost: row.destination_port, idx: idx++});
			}
			if (!this.head) this.head = current;
			if (current) current.next = msg;
			this.list.push(msg);
			current = msg;
		}
	}
	
	parseConnexCSText (txt) {
		const msgRegEx = /Sent from: (\d+\.\d+\.\d+\.\d+):(\d+) > (\d+\.\d+\.\d+\.\d+):(\d+) at (\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d).(\d+)(?:\r\n)*/
		let parts = txt.split(msgRegEx)
		parts.shift();	// We begin with an empty item, lets get rid of it.
		var current = null;
		var idx = 0;
		while (parts.length) {
			let [srcHost, srcPort, dstHost, dstPost, year, month, day, hour, minute, second, microsecond, txt] = parts.splice(0, 12);
			txt = txt.replace(/^\r\n/, '');
			let sip = sip_parsing.parse(txt); // txt.replace(/\n/g, "\r\n")
			var replyParts = /SIP\/2.0 (\d{3})/.exec(sip.first_line);
			let msg = null;
			if (Object.keys(request).includes(sip.$rm)){
				msg = new request[sip.$rm](sip, current, {year, month, day, hour, minute, second, microsecond, srcHost, srcPort, dstHost, dstPost, idx: idx++});
			} else if (replyParts && Object.keys(reply).includes(replyParts[1])) {
				msg = new reply[replyParts[1]](sip, current, {year, month, day, hour, minute, second, microsecond, srcHost, srcPort, dstHost, dstPost, idx: idx++});
			} else {
				msg = new Msg(sip, current, {year, month, day, hour, minute, second, microsecond, srcHost, srcPort, dstHost, dstPost, idx: idx++});
			}
			if (!this.head) this.head = current;
			if (current) current.next = msg;
			this.list.push(msg);
			current = msg;
		}
	}
	
	parseSngrepTxt (txt) {
		const msgRegEx = /(\d{4})\/(\d{2})\/(\d{2}) (\d{2}):(\d{2}):(\d{2}).(\d+) ([^:]+):([^ ]+) -> ([^:]+):([^ ]+)\r??\n/
		let parts = txt.split(msgRegEx)
		parts.shift();	// We begin with an empty item, lets get rid of it.
		var current = null;
		var idx = 0;
		while (parts.length) {
			let [year, month, day, hour, minute, second, microsecond, srcHost, srcPort, dstHost, dstPost, txt] = parts.splice(0, 12);
			let sip = sip_parsing.parse(txt.replace(/\n/g, "\r\n"));
			let msg = null;
			if (Object.keys(request).includes(sip.$rm)){
				msg = new request[sip.$rm](sip, current, {year, month, day, hour, minute, second, microsecond, srcHost, srcPort, dstHost, dstPost, idx: idx++});
			} else if (Object.keys(reply).includes(sip.$rr)) {
				msg = new reply[sip.$rr](sip, current, {year, month, day, hour, minute, second, microsecond, srcHost, srcPort, dstHost, dstPost, idx: idx++});
			} else {
				msg = new Msg(sip, current, {year, month, day, hour, minute, second, microsecond, srcHost, srcPort, dstHost, dstPost, idx: idx++});
			}
			if (!this.head) this.head = current;
			if (current) current.next = msg;
			this.list.push(msg);
			current = msg;
		}
	}
}
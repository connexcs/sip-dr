const Msg = require('./core');

module.exports = class Reply100 extends Msg {
	checks () {
//		this.checkFR();
	}
	
	checkFR() {
//		console.log('Checking on the Trying', this.moment.diff(this.getRequest().moment, 'milliseconds'));
	}
}
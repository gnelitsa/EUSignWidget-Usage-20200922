//================================================================================

/**
 * Модуль, що підключається для взаємодії з iframe SignWidget
 */

//================================================================================

(function (root, factory) {
	if (typeof define === 'function' && define.amd) {
		define([], factory);
	} else if (typeof module === 'object' && module.exports) {
		module.exports = factory();
	} else {
		var a = factory();
		for(var i in a) (typeof exports === 'object' ? exports : root)[i] = a[i];
	}
}(this, function () {

//================================================================================

var s_debug = false;

//================================================================================

/**
 * Конструктор для створення об'єкту для взаємодії з iframe SignWidget
 * @param parentId - Ідентифікатор батківського елементу для відображення iframe, 
 * який завантажує сторінку SignWidget
 * @param id - Ідентифікатор iframe, який завантажує сторінку SignWidget
 * @param src - URI з адресою за якою розташована сторінка SignWidget
 * @param formType - Тип форми для відображення (див. константи EndUser.FormType)
 * @param formParams - Параметри форми для відображення (див. EndUser.FormParams)
 */
var EndUser = function(parentId, id, src, formType, formParams) {
	this.sender = "EndUserSignWidgetConnector";
	this.reciever = "EndUserSignWidget";
	this.version = "20200710";
	this.parentId = parentId;
	this.id = id;
	this.src = src;
	this.formType = formType || 0;
	this.formParams = formParams || null;
	this.iframe = this._appendIframe(parentId, id, src);
	this.m_promises = [];
	this.m_listeners = [];
};

//--------------------------------------------------------------------------------

/**
 * Деструктор для видалення об'єкту для взаємодії з iframe SignWidget
 */
EndUser.prototype.destroy = function() {
	this._removeIframe(this.iframe, this.parentId);
	this.m_promises = [];
};

//================================================================================

EndUser.prototype._parseURL = function(url) {
	var urlRegEx = new RegExp([
					'^(https?:)//',
					'(([^:/?#]*)(?::([0-9]+))?)',
					'(/{0,1}[^?]*)'
				].join(''));
	var match = url.match(urlRegEx);
	return match && {
		protocol: match[1],
		host: match[2],
		hostname: match[3],
		port: match[4],
		pathname: match[5],
		origin: match[1] + '//' + match[2]
	};
};

//--------------------------------------------------------------------------------

EndUser.prototype._appendIframe = function(parentId, id, src) {
	var pThis = this;

	var srcParams = '?address=' + 
		pThis._parseURL(window.location.href).origin;
	srcParams += '&formType=' + pThis.formType;
	srcParams += '&debug=' + false;
	if (pThis.formParams) {
		for (var paramName in pThis.formParams)
			srcParams += '&' + paramName + '=' + pThis.formParams[paramName];
	}

	var iframe = document.createElement("iframe");
	iframe.setAttribute("src", src + srcParams);
	iframe.setAttribute("id", id);
	iframe.setAttribute("frameborder", "0");
	iframe.setAttribute("allowtransparency", "true");
	iframe.setAttribute("width", "100%");
	iframe.setAttribute("height", "100%");
	document.getElementById(parentId).appendChild(iframe);

	var origin = pThis._parseURL(src).origin;
	iframe.listener = function(event) {
		if (event.origin !== origin)
			return;

		pThis._recieveMessage(event);
	};
	window.addEventListener("message", iframe.listener, false);

	return iframe;
};

//--------------------------------------------------------------------------------

EndUser.prototype._removeIframe = function(iframe, parentId) {
	if (iframe == null)
		return;

	if (iframe.listener != null) {
		window.removeEventListener("message", iframe.listener);
		iframe.listener = null;
	}

	document.getElementById(parentId).removeChild(iframe);
};

//--------------------------------------------------------------------------------

EndUser.prototype._postMessage = function(cmd, params, _resolve, _reject) {
	var pThis = this;

	var p = null;
	var msg = {
		sender: pThis.sender,
		reciever: pThis.reciever,
		id: -1,
		cmd: cmd,
		params: params
	};

	if (typeof _resolve == 'undefined' && typeof _reject == 'undefined') {
		p = new Promise(function(resolve, reject) {
			msg.id = pThis.m_promises.push({
				resolve: resolve,
				reject: reject,
				msg: msg
			});
		});
	} else {
		msg.id = pThis.m_promises.push({
			resolve: _resolve,
			reject: _reject,
			msg: msg
		});
	}

	try {
		var signWidget = document.getElementById(pThis.id);
		signWidget.contentWindow.postMessage(msg, pThis.src);
	} catch (e) {
		if (s_debug)
			console.log("Main page post message error: " + e);
	}

	if (s_debug)
		console.log("Main page post message: " + msg);

	return p;
};

//--------------------------------------------------------------------------------

EndUser.prototype._recieveMessage = function(event) {
	var pThis = this;

	if (s_debug)
		console.log("Main page recieve message: " + event.data);

	var data = event.data;
	if ((data.reciever != pThis.sender) ||
		(data.sender != pThis.reciever)) {
		return;
	}

	if (data.id == -1) {
		var promises = pThis.m_promises;
		pThis.m_promises = [];

		promises.forEach(function(promise) {
			pThis._postMessage(
				promise.msg.cmd, promise.msg.params, 
				promise.resolve, promise.reject);
		});

		return;
	} else if (data.id == -2) {
		var widgetEvent = data.result;
		if (pThis.m_listeners[widgetEvent.type])
			pThis.m_listeners[widgetEvent.type](widgetEvent);
		return;
	}

	var p = pThis.m_promises[data.id - 1];
	if (!p) {
		return;
	}

	delete pThis.m_promises[data.id - 1];

	if (data.error) {
		p.reject(data.error);
	} else {
		p.resolve(data.result);
	}
};

//================================================================================

/**
 * Константи та функції підтримка яких буде видалена в наступних версіях
*/

/**
 * Типи форм для відображення в SignWidget. Змінено на EndUser.FormType.
*/
EndUser.FORM_TYPE_READ_PKEY = 1;
EndUser.FORM_TYPE_MAKE_NEW_CERTIFICATE = 2;
EndUser.FORM_TYPE_SIGN_FILE = 3;

//================================================================================

/**
 * Типи форм для відображення в SignWidget (Для самодостатніх форм взаємодії 
 * між web-сайтом та iframe не передбачена):
 * - ReadPKey				- Зчитування ос. ключа. Форма призначена для  
 * криптографічних операцій, які потребують ос. ключ користувача, наприклад 
 * виконання накладання підпису, шифрування\розшифрування даних.
 * - MakeNewCertificate		- Формування нового сертифікату. Форма призначена для
 * формування нового сертифікату з використанням діючого ос. ключа користувача.
 * - SignFile				- Накладання підпису на файл. Форма призначена для 
 * накладання підпису на файли та містить необхідні елементи з вибору файлів,
 * алгоритму та типу підпису. Самодостатня форма.
 * - ViewPKeyCertificates	- Відображення інформації про сертифікати ос. ключа. 
 * Форма призначена для відображення інформації про сертифікати зчитаного
* - MakeDeviceCertificate - Формування сертифікату для пристрою. Форма  
 * призначена для формування технологічного сертифікату для пристрою з 
 * використанням ос. ключа, відповідальної особи.
 * ос. ключа. Самодостатня форма.
*/
EndUser.FormType = {
	"ReadPKey":					1,
	"MakeNewCertificate":		2,
	"SignFile":					3,
	"ViewPKeyCertificates":	 	4,
	"MakeDeviceCertificate":	5
};

//--------------------------------------------------------------------------------

/**
 * Додаткові параметри форми відображення віджету:
 * - ownCAOnly		- зчитувати ос. ключі тільки свого ЦСК (першого в CAs.json).
 * Діалог вибору ЦСК не відображається
 * - showPKInfo		- відображати інформацію про зчитаний ос. ключ
*/
EndUser.FormParams = function() {
	this.ownCAOnly = false;
	this.showPKInfo = true;
};

//--------------------------------------------------------------------------------

/**
 * Типи сповіщеннь віджету підпису:
 * - ConfirmKSPOperation	- Сповіщення про необхідність підтвердження операції
 * з використання ос. ключа за допомогою сканування QR-коду в мобільному додатку
 * сервісу підпису. Повертається об'єкт EndUser.ConfirmKSPOperationEvent 
*/
EndUser.EventType = {
	"ConfirmKSPOperation":	2
};

//--------------------------------------------------------------------------------

/**
 * Типи алгоритмів підпису:
 * - DSTU4145WithGOST34311	- ДСТУ-4145 з використанням алгоритму гешування ГОСТ34310
 * - RSAWithSHA				- RSA з використанням алгоритму гешування SHA256
 * - ECDSAWithSHA			- ECDSA з використанням алгоритму гешування SHA256
*/
EndUser.SignAlgo = {
	"DSTU4145WithGOST34311":	1,
	"RSAWithSHA":				2,
	"ECDSAWithSHA":				3
};

//--------------------------------------------------------------------------------

/**
 * Формат підпису:
 * - CAdES_BES		- базовий формат підпису. Включає позначку часу 
 * від даних та сертифікат підписувача
 * - CAdES_T		- підис CAdES_BES, який додатково включає позначку 
 * часу від ЕЦП
 * - CAdES_C		- підпис CAdES-T, який додатково включає посилання 
 * на повний набір сертифікатів для перевірки підпису
 * - CAdES_X_Long	- підпис CAdES-C, який додатково включає повний набір 
 * сертифікатів ЦСК для перевірки підпису, а також відповіді від OCSP сервера 
 * зі статусом сертифіката підписувача
*/
EndUser.SignType = {
	"CAdES_BES":			1,
	"CAdES_T":				4,
	"CAdES_C":				8,
	"CAdES_X_Long":			16
};

//--------------------------------------------------------------------------------

/**
 * Призначення ключа (бітова маска):
 * - DigitalSignature	- ключ призначений для накладання ЕЦП
 * - KeyAgreement		- ключ призначений для протоколів розподілу
 *  ключів (направленого шифрування)
 * Призначення ключа міститься в інформації про сертифікат
 */
EndUser.KeyUsage = {
	"DigitalSignature":	1,
	"KeyAgreement":		16,
};

/**
 * Тип відкритого ключа (алгоритму):
 * - DSTU4145			- ключ призначений для використання в алгоритмах ДСТУ 4145
 * - RSA				- ключ призначений для використання в алгоритмах RSA
 * - ECDSA				- ключ призначений для використання в алгоритмах ECDSA
 * Тип відкритого ключа міститься в інформації про сертифікат
 */
EndUser.PublicKeyType = {
	"DSTU4145":			1,
	"RSA":				2,
	"ECDSA":			4,
};

//--------------------------------------------------------------------------------

/**
 * Тип запиту для зміни статусу власного сертифіката користувача:
 * - Revoke				- відкликання
 * - Hold				- блокування
 */
EndUser.CCSType = {
	"Revoke": 			1,
	"Hold":				2
};

/**
 * Причина відкликання власного сертифіката користувача:
 * - Unknown			- невизначена
 * - KeyCompromise		- компрометація ос. ключа
 * - NewIssued			- формування нового ос. ключа
 */
EndUser.RevocationReason = {
    "Unknown":			0,
    "KeyCompromise":	1,
    "NewIssued":		2
};

//================================================================================

/**
 * Сповіщення про необхідність підтвердження операції з використання ос. ключа 
 * за допомогою сканування QR-коду в мобільному додатку сервісу підпису 
 * @property url <string> - URL для підтвердження операції
 * @property qrImage <string> - Зображення у вигляді QR-коду в форматі BMP, 
 * закодоване з використанням кодування BASE64 
 * @property mobileAppName <string> - Ім'я мобільного додатку сервісу підпису 
*/
EndUser.ConfirmKSPOperationEvent = function() {
	this.url = '';
	this.qrImage = '';
	this.mobileAppName = '';
};

//================================================================================

/**
 * Реєстрація обробника для отримання сповіщення про події від віджету підпису.
 * @param eventType <EndUser.EventType> - Тип події
 * @param listener <function (event <EndUser.Event>)> - Функція-обробник подій
 * @returns Promise<Array<void>> 
*/
EndUser.prototype.AddEventListener = function(eventType, listener) {
	this.m_listeners[eventType] = listener;

	var params = [eventType];
	return this._postMessage('AddEventListener', params);
};

//================================================================================

/**
 * Стирання зчитаного ос. ключа користувача.
 * @returns Promise<Array<void>> 
*/
EndUser.prototype.ResetPrivateKey = function() {
	var params = Array.prototype.slice.call(arguments);
	return this._postMessage('ResetPrivateKey', params);
};

//--------------------------------------------------------------------------------

/**
 * Зчитування ос. ключа користувача. Функція повинна викликатися до 
 * функцій які використовують ос. ключ, наприклад SignHash, SignData.
 * Проміс буде виконано, коли користувач зчитає ос. ключ. Якщо ос. ключ 
 * вже зчитано проміс виконується відразу.  
 * @returns Promise<Array<object>> - Масив з інформацією про сертифікати 
 * зчитаного ос. ключа
*/
EndUser.prototype.ReadPrivateKey = function() {
	var params = Array.prototype.slice.call(arguments);
	return this._postMessage('ReadPrivateKey', params);
};

//--------------------------------------------------------------------------------

/**
 * Формування нового сертифікату для діючого ключа. Діючий ключ попередньо 
 * повинен бути зчитаний функцією ReadPrivateKey, після чого необхідно викликати 
 * функцію MakeNewCertificate для відображена форми обрання носія нового ключа
 * @param euParams <object> - Інформація про користувача, яку необхідно змінити 
 * в новому сертифікаті. Доступні поля phone, EMail. Опціональний параметр
 * @returns Promise<void>
*/
EndUser.prototype.MakeNewCertificate = function(euParams) {
	var params = Array.prototype.slice.call(arguments);
	return this._postMessage('MakeNewCertificate', params);
};

//--------------------------------------------------------------------------------

/**
 * Формування сертифікатів для пристрою з використанням ос. ключа 
 * відповідальної особи. Ос. ключ відповідальної особи попередньо повинен 
 * бути зчитаний функцією ReadPrivateKey, після чого необхідно викликати 
 * функцію MakeDeviceCertificate для відображена форми формування сертифікатів
 * @param certParams <object> - Параметри сертифікату
 * @returns Promise<void>
*/
EndUser.prototype.MakeDeviceCertificate = function(certParams) {
	var params = Array.prototype.slice.call(arguments);
	return this._postMessage('MakeDeviceCertificate', params);
};

//--------------------------------------------------------------------------------

/**
 * Зміна статусу сертифікату діючого ос. ключа користувача. Діючий ключ попередньо 
 * повинен бути зчитаний функцією ReadPrivateKey, після чого необхідно викликати 
 * функцію ChangeOwnCertificatesStatus
 * @param ccsType <CCSType> - Тип запиту для зміни статусу власного 
 * сертифіката користувача
 * @param revocationReason <RevocationReason> - Причина відкликання власного 
 * сертифіката користувача. При блокуванні сертифікату передається значення
 * EndUser.RevocationReason.Unknown.
 * @returns Promise<void>
*/
EndUser.prototype.ChangeOwnCertificatesStatus = function(
	ccsType, revocationReason) {
	var params = Array.prototype.slice.call(arguments);
	return this._postMessage('ChangeOwnCertificatesStatus', params);
};

//--------------------------------------------------------------------------------

/**
 * Підпис геш значення(ь). Зчитаний ос. ключ повинен мати сертифікат призначений
 * для підпису та тип відкритого ключа повинен відповідати алгоритму підпису.
 * @param hash <Uint8Array | string | Array <Uint8Array | string>> - геш значення 
 * для підпису у вигляді масиву байт чи закодоване у вигляді строки BASE64.
 * @param asBase64String <boolean> - Признак необхідності повертати 
 * підпис у вигляді строки BASE64. Опціональний параметр. За замовчанням - false.
 * @param signAlgo <number> - Алгоритм підпису. Можливі значення визначені в 
 * EndUser.SignAlgo. За замовчанням - EndUser.SignAlgo.DSTU4145WithGOST34311.
 * @param signType <number> - Тип підпису. Можливі значення визначені в 
 * EndUser.SignType. За замовчанням - EndUser.SignType.CAdES_BES.
 * @param previousSign <Uint8Array | string | Array <Uint8Array | string>> - 
 * попередній підпис(и) для геш значення(ь), до якого(их) буде додано
 * створений підпис. Додавання підпису можливе лише за умови
 * якщо алгоритми підписів (signAlgo) співпадають, та попередній підпис 
 * не містить підписувача. Опціональний параметр. За замовчанням - null. 
 * @returns Promise<Uint8Array | string | Array <Uint8Array | string>> - Підпис(и)
*/
EndUser.prototype.SignHash = function(
	hash, asBase64String, signAlgo, signType, previousSign) {
	var params = Array.prototype.slice.call(arguments);
	return this._postMessage('SignHash', params);
};

//--------------------------------------------------------------------------------

/**
 * Підпис даних. Зчитаний ос. ключ повинен мати сертифікат призначений
 * для підпису та тип відкритого ключа повинен відповідати алгоритму підпису.
 * @param data <Uint8Array | string | Array <Uint8Array | string>> - дані 
 * для підпису. Дані, що передаються у вигляді string автоматично 
 * конвертуються до типу Uint8Array з використанням кодування UTF-8
 * @param external <boolean> - Признак необхідності формування зовнішнього 
 * підпису (дані та підпис зберігаються окремо). Опціональний параметр. 
 * За замовчанням - true.
 * @param asBase64String <boolean> - Признак необхідності повертати 
 * підпис у вигляді строки BASE64. Опціональний параметр. За замовчанням - false.
 * @param signAlgo <number> - Алгоритм підпису. Можливі значення визначені в 
 * EndUser.SignAlgo. За замовчанням - EndUser.SignAlgo.DSTU4145WithGOST34311.
 * @param previousSign <Uint8Array | string | Array <Uint8Array | string>> - 
 * попередній підпис(и) для даних, до якого(их) буде додано створений підпис. 
 * Додавання підпису можливе лише за умови якщо алгоритми підписів (signAlgo) 
 * співпадають, та попередній підпис не містить підписувача. Опціональний параметр. 
 * За замовчанням - null. Для внутрішнього підпису (external = false) параметр 
 * data не використовується.
 * @param signType <number> - Тип підпису. Можливі значення визначені в 
 * EndUser.SignType. За замовчанням - EndUser.SignType.CAdES_BES.
 * @returns Promise<Uint8Array | string | Array <Uint8Array | string>> - Підпис(и)
*/
EndUser.prototype.SignData = function(
	data, external, asBase64String, signAlgo, previousSign, signType) {
	var params = Array.prototype.slice.call(arguments);
	return this._postMessage('SignData', params);
};

//--------------------------------------------------------------------------------

/**
 * Зашифрування даних з використанням алгоритму ГОСТ 28147-2009 та 
 * протоколу розподілу ключів ДСТУ 4145-2002. Зчитаний ос. ключ повинен мати
 * сертифікат, який призначений для протоколів розподілу ключів в державних 
 * алгоритмах та протоколах.
 * @param recipientsCerts <Array<Uint8Array>> - сертифікати отримувачів.
 * Сертифікати отримувачів повинні мати призначеня для протоколів розподілу 
 * ключів в державних алогритмах та протоколах.
 * @param data <Uint8Array | string> - дані для зашифрування. Дані, що 
 * передаються у вигляді string автоматично конвертуються до типу Uint8Array 
 * з використанням кодування UTF-8
 * @param signData <boolean> - Признак необхідності додатково підписувати дані 
 * (зашифровані дані спеціального формату з підписом, який автоматично 
 * перевіряється при розшифруванні даних). Зчитаний ос. ключ повинен мати 
 * сертифікат, який призначений для підпису даних за алгоритмом ДСТУ 4145. 
 * Опціональний параметр. За замовчанням - false.
 * @param asBase64String <boolean> - Признак необхідності повертати 
 * зашифровані дані у вигляді строки BASE64. Опціональний параметр. 
 * За замовчанням - false.
 * @param useDynamicKey <boolean> - Признак необхідності зашифровувати дані з 
 * використанням динамічного ключа відправника. Призначений для використання у 
 * разі відсутності сертифікат відправника, який призначений для протоколів 
 * розподілу ключів в державних алгоритмах та протоколах. Опціональний параметр. 
 * За замовчанням - false.
 * @returns Promise<Uint8Array | string> - Зашифровані дані
*/
EndUser.prototype.EnvelopData = function(
	recipientsCerts, data, signData, asBase64String, useDynamicKey) {
	var params = Array.prototype.slice.call(arguments);
	return this._postMessage('EnvelopData', params);
};

//--------------------------------------------------------------------------------

/**
 * Розшифрування даних з використанням алгоритму ГОСТ 28147-2009 та 
 * протоколу розподілу ключів ДСТУ 4145-2002. Зчитаний ос. ключ повинен мати
 * сертифікат, який призначений для протоколів розподілу ключів в державних 
 * алгоритмах та протоколах.
 * @param envelopedData <Uint8Array | string> - дані для розшифрування. Дані, що 
 * передаються у вигляді string повинні бути закодовані з використанням кодування
 * BASE64
 * @param senderCert <Uint8Array> - Сертифікат відправника зашифрованих даних.
 * Опціональний параметр. За замовчанням - null.
 * @returns Promise<any> - Інформація про відправника та розшифровані дані
*/
EndUser.prototype.DevelopData = function(
	envelopedData, senderCert) {
	var params = Array.prototype.slice.call(arguments);
	return this._postMessage('DevelopData', params);
};

//================================================================================

	return {
		EndUser : EndUser
	};
}));

//================================================================================

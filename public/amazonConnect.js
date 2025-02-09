(function(w, d, x, id){
    s=d.createElement('script');
    s.src='https://d2s9x5slbvr0vu.cloudfront.net/amazon-connect-chat-interface-client.js';
    s.async=1;
    s.id=id;
    d.getElementsByTagName('head')[0].appendChild(s);
    w[x] =  w[x] || function() { (w[x].ac = w[x].ac || []).push(arguments) };
  })(window, document, 'amazon_connect', '8483c90b-8a5c-44af-befd-60c5cf644400');
  amazon_connect('styles', { iconType: 'CHAT_VOICE', openChat: { color: '#ffffff', backgroundColor: '#a668ff' }, closeChat: { color: '#ffffff', backgroundColor: '#a668ff'} });
  amazon_connect('snippetId', 'QVFJREFIaG8zNDMxY1o2YzBOUmhhR09ycENzVWhNWXgzd3ZXalZIbWFFbkY5TVBBTUFIYXVJS0N3SUtTZlhWYjNETkJxK3ZvQUFBQWJqQnNCZ2txaGtpRzl3MEJCd2FnWHpCZEFnRUFNRmdHQ1NxR1NJYjNEUUVIQVRBZUJnbGdoa2dCWlFNRUFTNHdFUVFNaHdKL3BkL2tpelFaRjhqOUFnRVFnQ3NQNmwyc3R1YmZza1FWemV0THlVdCt2VEpOTzlBdnN0Y0lBVmJsWVRuZm9NTnFjeEIrTnl5S0xhYU46OlhDSmNZNTduRlBqWjhiY0ZtUG5DalNuMEtFYUNkYkl6K2NUY0hlbDNTMk1LUENOY2xXTk9hSG8xTWY3VjJpSDRjRVI5aE1MN0tMTVRJYUtBcnFHaHdEQzBpWCtGSFIyL29TcUJ3YTROTFJSUCs5ZjV1UFE5Vkg4QnJ2TThKRkpRQWEza1I0Sk9WTjNTT24vWFN6aWMrdkFpZ29RQUkxTT0=');
  amazon_connect('supportedMessagingContentTypes', [ 'text/plain', 'text/markdown', 'application/vnd.amazonaws.connect.message.interactive', 'application/vnd.amazonaws.connect.message.interactive.response' ]);

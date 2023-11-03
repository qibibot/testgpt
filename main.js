function load (name){
  console.log('Loading ' + name + '...');
  return require('./services/' + name + '.js');
}

load('main');
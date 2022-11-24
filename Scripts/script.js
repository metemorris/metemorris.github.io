  function randomImage(){
  /*var images = [
   'Images/topbg.jpg',
   'Images/devilsbridge.jpg',
   'Images/kopru.jpg',
   'Images/presentation.jpg',
   'Images/sendegit.jpg',
   'Images/besparmak.jpg',
   'Images/slr2017.jpg',
   'Images/retreat.jpg'];*/
  
  var images = [
    'Images/kilise.jpg',
    'Images/beach.jpg'
  ];
  var size = images.length;
  var x = Math.floor(size * Math.random());
  console.log(x);
  var element = document.getElementsByClassName('bg-1');
  console.log(element);
  element[0].style["background-image"] = "url("+ images[x] + ")";
  }

  document.addEventListener("DOMContentLoaded", randomImage);


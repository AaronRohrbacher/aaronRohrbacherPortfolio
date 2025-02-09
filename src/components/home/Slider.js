import React, { useState, useEffect } from 'react';

// Import your local images here
import image1 from '../../img/self.png';
import image2 from '../../img/self2.png';
import image3 from '../../img/self3.png';
import image4 from '../../img/self4.png';


const Slider = () => {
  const [currentIndex, setCurrentIndex] = useState(0);

  const images = [
    image1,
    image2,
    image3,
    image4
  ];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prevIndex) => 
        prevIndex === images.length - 1 ? 0 : prevIndex + 1
      );
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div style={{
      width: '100%',
      height: '100%',
      position: 'relative',
      overflow: 'hidden',
      borderRadius: '50%',
    }}>
      {images.map((image, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: index === currentIndex ? 1 : 0,
            transition: 'opacity 1s ease-in-out',
          }}
        >
          <img
            src={image}
            alt={`Slide ${index + 1}`}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              borderRadius: '50%',
            }}
          />
        </div>
      ))}
    </div>
  );
};

export default Slider;
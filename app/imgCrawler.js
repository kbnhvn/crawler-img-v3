const puppeteer = require('puppeteer');
const fs  = require('fs');

//Site a vérifier
const urlList = ['https://www.la-loi-pinel.com/'];
const urlTestedList = [];

function mergeArrays(...arrays) {
    let jointArray = []

    arrays.forEach(array => {
        jointArray = [...jointArray, ...array]
    })
    const uniqueArray = jointArray.reduce((newArray, item) =>{
        if (newArray.includes(item)){
            return newArray
        } else {
            return [...newArray, item]
        }
    }, [])
    return uniqueArray
}



  const getAllUrl = async (browser, urlList) => {
    if(urlList.length > 0){
        let page = await browser.newPage();
        const url = urlList.shift();
        if(urlTestedList.includes(url)){
            return getAllUrl(browser, urlList);
        }
        console.log('Check de l\'url : '+url);
        try {
            await page.goto(url);
        } catch (err) {
            console.error(err.message);
            return getAllUrl(browser, urlList);
        }
        await page.waitForSelector('body');
        const allHrefs = await page.evaluate(() =>
            [...document.querySelectorAll('a[href^="https://www.la-loi-pinel.com/"], a[href^="/"]')].map(link => link.href)
        );
        const allDataUrls = await page.evaluate(() => 
                [...document.querySelectorAll('[data-url]')].map(function(element){
                    const dataUrl = element.getAttribute('data-url');
                        if(dataUrl.includes('la-loi-pinel.com') && !dataUrl.startsWith('#') && !dataUrl.startsWith('mailto') && !dataUrl.includes('linkedin.com') && !dataUrl.includes('facebook.com') && !dataUrl.includes('twitter.com') && !dataUrl.includes('plus.google.com')){
                            return dataUrl;
                        } else {
                            return ;
                        } 
                })    
        );
        urlList = mergeArrays(urlList,allHrefs,allDataUrls);
        urlTestedList.push(url)
        console.log('Liste url : '+urlList.length)
        console.log('Liste url finale : '+urlTestedList.length)
        await page.close();
        return getAllUrl(browser, urlList);
    } else {
        return [urlTestedList];
    }
}

//Récupération des images
const checkImg = async (page, urlList, imgList) => {
    urlList.forEach(async (url) => {
        try {
    
        // Va sur la page spécifique
        await page.goto(url);
        console.log("Page chargée");
    
    
            //Traitement
            //Récupère les liens des images dans un array
        const imgSrcs = await page.evaluate(() => {
            const srcs = Array.from(
            document.querySelectorAll("img")
            ).map((image) => image.getAttribute("src"));
            return srcs;
        });
        console.log("Page analysée");
    
        //Store data dans un array
        imgList.push(imgSrcs)
    
        } catch (error) {
        console.log(error);
        }
    })
    return [imgList]
  };

const scrap = async () => {
    const imgList = [];
    const browser = await puppeteer.launch({ headless: true, args: ['--shm-size=3gb'] });
    const urls = await getAllUrl(browser, urlList);
    console.log('Récupération des liens terminée.');
    console.log('Récupération des images.');
    images = await checkImg(page, urlList, imgList);
    browser.close();
    return images;
}

scrap()
  .then(value => {
        console.log('Script terminé.');
        fs.writeFileSync('./imgList.txt', value[1].join ('\n') , {flag: "w"});
  })
  .catch(e => console.log(`error: ${e}`))
